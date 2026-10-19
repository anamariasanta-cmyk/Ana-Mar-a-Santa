/* =====================================================================
   DIMENSIONADO DE CINTAS TRANSPORTADORAS
   script.js: carga los JSON, calcula y dibuja los resultados.

   Estructura del archivo:
     1. Utilidades (interpolación, formato de números)
     2. MOTOR DE CÁLCULO: calcularCinta(entrada, datos)  -> función pura
     3. Interfaz: lectura de controles y presentación de resultados
     4. Dibujos en <canvas>: sección transversal, capacidad, tensiones
   ===================================================================== */

"use strict";

/* ---------------------------------------------------------------------
   1. UTILIDADES
   --------------------------------------------------------------------- */

// Interpolación lineal en una tabla (xs creciente). Fuera de rango: extremo.
function interpolar(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) {
      const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
      return ys[i - 1] + t * (ys[i] - ys[i - 1]);
    }
  }
  return ys[ys.length - 1];
}

// Formato español: coma decimal y punto como separador de miles.
function fmt(x, dec = 2) {
  if (x === null || x === undefined || !isFinite(x)) return "—";
  const txt = Math.abs(x).toFixed(dec);
  const [ent, dec2] = txt.split(".");
  const signo = x < 0 && Number(txt) !== 0 ? "−" : "";
  return signo + ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (dec2 ? "," + dec2 : "");
}

// Igual que fmt, pero entre paréntesis si es negativo (para sumas: "a + (−b)").
function fmtS(x, dec = 2) {
  return x < 0 ? `(${fmt(x, dec)})` : fmt(x, dec);
}

const RAD = Math.PI / 180;

/* ---------------------------------------------------------------------
   2. MOTOR DE CÁLCULO
   Recibe todos los datos de entrada y las tablas JSON. Devuelve un objeto
   con los resultados, los pasos de la memoria de cálculo y los avisos.
   No toca la página: así se puede comprobar de forma independiente.
   --------------------------------------------------------------------- */

// Clase de fluidez a partir del ángulo de reposo α (tabla de los apuntes).
function clasificarFluidez(alfa, parametros) {
  if (alfa === null || alfa === undefined || isNaN(alfa)) return null;
  const clases = parametros.fluidez.clases;
  for (const c of clases) {
    if (alfa <= c.alfaMax) return c;
  }
  return clases[clases.length - 1];
}

function calcularCinta(e, D) {
  const P = D.parametros;
  const CAP = D.capacidades;
  const g = P.g;
  const pasos = [];
  const avisos = [];
  const paso = (titulo, formula, sustitucion, resultado, nota) =>
    pasos.push({ titulo, formula, sustitucion, resultado, nota });
  const aviso = (nivel, texto) => avisos.push({ nivel, texto });

  // ---- Validación básica de los datos de entrada ----
  const positivos = { "Caudal Q": e.Q, "Velocidad v": e.v, "Longitud L": e.L, "Densidad": e.rho,
    "Paso de rodillos de carga": e.ao, "Paso de rodillos de retorno": e.au, "Rendimiento": e.eta,
    "Diámetro de tambor": e.Dtambor, "Coeficiente de seguridad": e.FS };
  for (const [nombre, valor] of Object.entries(positivos)) {
    if (!(valor > 0)) return { error: `El valor de «${nombre}» debe ser un número mayor que cero.` };
  }
  if (e.delta < 0 || e.delta > 20) return { error: "La inclinación debe estar entre 0° y 20° (rango de la tabla del factor K)." };
  if (e.eta > 1) return { error: "El rendimiento debe ser un valor entre 0 y 1." };

  const tipo = CAP.tipos[e.tipo];
  const lamKey = String(e.lambda);
  const betas = CAP.angulosSobrecarga;
  const iBeta = betas.indexOf(Number(e.beta));
  if (!tipo || !tipo.angulosArtesa.map(String).includes(lamKey) || iBeta < 0) {
    return { error: "Combinación de estación / ángulo de artesa / ángulo de sobrecarga no disponible en las tablas." };
  }

  // ================= PASO 1: CAPACIDAD Y ANCHO DE BANDA =================
  const IM = e.Q / e.rho;
  paso("Caudal volumétrico necesario", "I_M = Q / q_s",
    `I_M = ${fmt(e.Q, 1)} t/h / ${fmt(e.rho, 3)} t/m³`, `${fmt(IM, 2)} m³/h`);

  const K = interpolar(P.factorInclinacionK.delta, P.factorInclinacionK.K, e.delta);
  paso("Factor de reducción por inclinación", "K = f(δ)  (Rulmeca, Tab. 6)",
    `δ = ${fmt(e.delta, 1)}°  →  K`, fmt(K, 3),
    "Interpolación lineal entre los valores tabulados.");

  paso("Factor de irregularidad de la alimentación", "K₁", "", fmt(e.K1, 2));

  const IVM = IM / (K * e.K1);
  paso("Caudal volumétrico equivalente (cinta horizontal, carga regular)", "I_VM = I_M / (K · K₁)",
    `I_VM = ${fmt(IM, 2)} / (${fmt(K, 3)} · ${fmt(e.K1, 2)})`, `${fmt(IVM, 2)} m³/h`);

  const IVTreq = IVM / e.v;
  paso("Capacidad volumétrica necesaria a v = 1 m/s", "I_VT,nec = I_VM / v",
    `I_VT,nec = ${fmt(IVM, 2)} / ${fmt(e.v, 2)}`, `${fmt(IVTreq, 2)} m³/h`,
    `Se busca en la Tab. ${tipo.tabla} (${tipo.nombre}, λ = ${lamKey}°, β = ${e.beta}°) el menor ancho con I_VT ≥ I_VT,nec.`);

  // Tabla de anchos con su capacidad para la combinación elegida.
  const sospechosos = CAP.valoresSospechosos || [];
  const listaAnchos = tipo.anchos.map(B => {
    const IVT = tipo.IVT[String(B)][lamKey][iBeta];
    const Qmax = IVT * e.v * K * e.K1 * e.rho;
    const sosp = sospechosos.find(s => s.tipo === e.tipo && s.ancho === B &&
      String(s.lambda) === lamKey && s.beta === Number(e.beta));
    return { B, IVT, Qmax, cumple: IVT >= IVTreq, sospechoso: sosp || null };
  });

  let fila;
  if (e.anchoFijo && Number(e.anchoFijo) > 0) {
    fila = listaAnchos.find(a => a.B === Number(e.anchoFijo));
    if (!fila) return { error: "El ancho elegido no está disponible para este tipo de estación." };
  } else {
    fila = listaAnchos.find(a => a.cumple);
    if (!fila) {
      const ultimo = listaAnchos[listaAnchos.length - 1];
      return { error: `Ningún ancho de la Tab. ${tipo.tabla} alcanza la capacidad necesaria ` +
        `(I_VT,nec = ${fmt(IVTreq, 1)} m³/h; máximo disponible ${fmt(ultimo.IVT, 1)} m³/h para B = ${ultimo.B} mm). ` +
        `Aumenta la velocidad, el ángulo de artesa o cambia el tipo de estación.`, listaAnchos, IVTreq };
    }
  }
  const B = fila.B;
  const Bm = B / 1000;
  const llenado = IVTreq / fila.IVT;
  const QmaxB = fila.Qmax;

  paso("Ancho de banda seleccionado", "I_VT(B) ≥ I_VT,nec",
    `B = ${B} mm  →  I_VT = ${fmt(fila.IVT, 1)} m³/h ${fila.IVT >= IVTreq ? "≥" : "<"} ${fmt(IVTreq, 2)} m³/h`,
    `B = ${B} mm`,
    e.anchoFijo ? "Ancho impuesto por el usuario." : "Menor ancho normalizado que cumple.");

  paso("Capacidad máxima de la cinta elegida", "Q_max = I_VT · v · K · K₁ · q_s",
    `Q_max = ${fmt(fila.IVT, 1)} · ${fmt(e.v, 2)} · ${fmt(K, 3)} · ${fmt(e.K1, 2)} · ${fmt(e.rho, 3)}`,
    `${fmt(QmaxB, 1)} t/h`, `Grado de llenado = ${fmt(llenado * 100, 1)} %`);

  if (llenado > 1) aviso("error", `El ancho impuesto (B = ${B} mm) NO tiene capacidad suficiente: grado de llenado ${fmt(llenado * 100, 1)} %. Elige un ancho mayor o pulsa «Automático».`);
  if (fila.sospechoso) aviso("aviso", `El valor de tabla usado (I_VT = ${fmt(fila.IVT, 1)} m³/h, B = ${B} mm, λ = ${lamKey}°, β = ${e.beta}°) parece una errata del catálogo: ${fila.sospechoso.motivo}`);

  // ================= PASO 2: GEOMETRÍA Y CARGAS POR METRO =================
  const deltaR = e.delta * RAD;
  const H = e.L * Math.sin(deltaR);
  paso("Altura a elevar", "H = L · sen δ",
    `H = ${fmt(e.L, 1)} · sen ${fmt(e.delta, 1)}°`, `${fmt(H, 2)} m`);

  const qG = e.Q / (3.6 * e.v);
  paso("Masa del material por metro de cinta", "q_G = Q / (3,6 · v)",
    `q_G = ${fmt(e.Q, 1)} / (3,6 · ${fmt(e.v, 2)})`, `${fmt(qG, 2)} kg/m`);

  // Masas de las partes giratorias de los rodillos
  const masaPorM = P.rodillos.masaGiratoriaKgPorMetro[String(e.diamRodillo)];
  const longRod = P.rodillos.factorLongitudRodillos * Bm;
  const mRO = (e.mRO && e.mRO > 0) ? e.mRO : masaPorM * longRod;
  const mRU = (e.mRU && e.mRU > 0) ? e.mRU : masaPorM * longRod;
  const qRO = mRO / e.ao;
  const qRU = mRU / e.au;
  paso("Masa giratoria de rodillos portantes por metro", "q_RO = m_RO / a_o",
    `q_RO = ${fmt(mRO, 2)} kg / ${fmt(e.ao, 2)} m`, `${fmt(qRO, 2)} kg/m`,
    (e.mRO && e.mRO > 0) ? "Masa por estación introducida por el usuario." :
      `m_RO estimada = ${fmt(masaPorM, 1)} kg/m · ${fmt(P.rodillos.factorLongitudRodillos, 2)} · B (rodillos Ø${e.diamRodillo} mm).`);
  paso("Masa giratoria de rodillos de retorno por metro", "q_RU = m_RU / a_u",
    `q_RU = ${fmt(mRU, 2)} kg / ${fmt(e.au, 2)} m`, `${fmt(qRU, 2)} kg/m`);

  // Coeficiente C (resistencias secundarias)
  const C = e.Cmanual && e.Cmanual > 0 ? e.Cmanual : interpolar(P.coeficienteC.L, P.coeficienteC.C, e.L);
  paso("Coeficiente de resistencias secundarias", "C = f(L)  (DIN 22101)",
    `L = ${fmt(e.L, 1)} m  →  C`, fmt(C, 3), e.Cmanual > 0 ? "Valor introducido por el usuario." : "Interpolación lineal en la tabla de DIN 22101.");

  // Datos de la banda
  const tejido = P.calidadTejido.opciones.find(t => t.codigo === e.tejido);
  const rhoGoma = P.calidadRecubrimiento.densidadGomaKgM2mm;
  const s = P.flechaAdmisible.valor;
  const eMuTheta = Math.exp(e.mu * e.theta * RAD);
  const cosd = Math.cos(deltaR);

  // ---- Cálculo iterativo: el peso de la banda depende del nº de telas, y éste de la tensión ----
  let n = P.banda.telasMin;
  let r = null;
  for (let it = 0; it < 30; it++) {
    const masaBandaM2 = n * tejido.masaTelaKgM2 + (e.eSup + e.eInf) * rhoGoma;
    const qB = Bm * masaBandaM2;
    const Fcarga = C * e.f * e.L * g * (qRO + (qB + qG) * cosd) + (qB + qG) * H * g;
    const Fret = C * e.f * e.L * g * (qRU + qB * cosd) - qB * H * g;
    const Fu = Fcarga + Fret;
    const T2E = Fu / (eMuTheta - 1);
    const T0c = (qB + qG) * g * e.ao / (8 * s);
    const T0r = qB * g * e.au / (8 * s);
    const candidatos = [
      { valor: T2E, criterio: "adherencia en el tambor motriz (Euler-Eytelwein)" },
      { valor: T0c - Fret, criterio: "flecha máxima en el ramal de carga" },
      { valor: T0r, criterio: "flecha máxima en el ramal de retorno" },
      { valor: T0r - Fret, criterio: "flecha máxima en el ramal de retorno (cola)" }
    ];
    const gobierna = candidatos.reduce((a, b) => (b.valor > a.valor ? b : a));
    const T2 = gobierna.valor;
    const T3 = T2 + Fret;
    const T1 = T2 + Fu;
    const resistenciaTela = tejido.resistenciaKgfCm * g; // N/cm por tela
    const nNec = Math.ceil((T1 * e.FS) / ((B / 10) * resistenciaTela) - 1e-9);
    r = { n, masaBandaM2, qB, Fcarga, Fret, Fu, T2E, T0c, T0r, gobierna, T1, T2, T3, nNec, resistenciaTela, it };
    const nNuevo = Math.max(P.banda.telasMin, nNec);
    if (nNuevo <= n) break;
    n = nNuevo;
  }

  const { qB, masaBandaM2, Fcarga, Fret, Fu, T2E, T0c, T0r, gobierna, T1, T2, T3, nNec, resistenciaTela } = r;

  paso("Masa de la banda por metro", "q_B = B · (n · m_tela + (e_sup + e_inf) · ρ_goma)",
    `q_B = ${fmt(Bm, 3)} · (${n} · ${fmt(tejido.masaTelaKgM2, 2)} + (${fmt(e.eSup, 1)} + ${fmt(e.eInf, 1)}) · ${fmt(rhoGoma, 2)})`,
    `${fmt(qB, 2)} kg/m`, `Calculada con el nº de telas final (n = ${n}), tras ${r.it + 1} iteración(es).`);

  // ================= PASO 3: RESISTENCIAS Y POTENCIA =================
  paso("Resistencia en el ramal de carga", "F_carga = C·f·L·g·[q_RO + (q_B + q_G)·cos δ] + (q_B + q_G)·H·g",
    `F_carga = ${fmt(C, 3)}·${fmt(e.f, 3)}·${fmt(e.L, 1)}·${fmt(g, 2)}·[${fmt(qRO, 2)} + (${fmt(qB, 2)} + ${fmt(qG, 2)})·${fmt(cosd, 4)}] + (${fmt(qB, 2)} + ${fmt(qG, 2)})·${fmt(H, 2)}·${fmt(g, 2)}`,
    `${fmt(Fcarga, 0)} N`);
  paso("Resistencia en el ramal de retorno", "F_ret = C·f·L·g·[q_RU + q_B·cos δ] − q_B·H·g",
    `F_ret = ${fmt(C, 3)}·${fmt(e.f, 3)}·${fmt(e.L, 1)}·${fmt(g, 2)}·[${fmt(qRU, 2)} + ${fmt(qB, 2)}·${fmt(cosd, 4)}] − ${fmt(qB, 2)}·${fmt(H, 2)}·${fmt(g, 2)}`,
    `${fmt(Fret, 0)} N`);
  paso("Fuerza tangencial total en el tambor motriz", "F_U = F_carga + F_ret = C·f·L·g·[q_RO + q_RU + (2q_B + q_G)·cos δ] + q_G·H·g",
    `F_U = ${fmt(Fcarga, 0)} + ${fmtS(Fret, 0)}`, `${fmt(Fu, 0)} N`);

  if (!(Fu > 0)) return { error: "La fuerza tangencial resulta nula o negativa: con estos datos la cinta no necesita accionamiento (caso no contemplado)." };

  const PA = Fu * e.v;
  const PM = PA / e.eta;
  const motor = P.motoresNormalizadosKW.find(p => p >= PM / 1000 - 1e-9) || null;
  paso("Potencia en el tambor motriz", "P_A = F_U · v",
    `P_A = ${fmt(Fu, 0)} N · ${fmt(e.v, 2)} m/s`, `${fmt(PA / 1000, 2)} kW`);
  paso("Potencia necesaria del motor", "P_M = P_A / η",
    `P_M = ${fmt(PA / 1000, 2)} / ${fmt(e.eta, 2)}`, `${fmt(PM / 1000, 2)} kW`,
    motor ? `Motor normalizado inmediatamente superior: ${fmt(motor, motor < 1 ? 2 : 1)} kW.` : "Supera el catálogo de motores normalizados.");

  const Dm = e.Dtambor / 1000;
  const par = Fu * Dm / 2;
  const nTambor = 60 * e.v / (Math.PI * Dm);
  const iReductor = 1450 / nTambor;
  paso("Par y velocidad en el tambor motriz", "M = F_U · D/2 ;  n = 60·v / (π·D) ;  P = M · ω",
    `M = ${fmt(Fu, 0)} · ${fmt(Dm, 3)}/2 ;  n = 60·${fmt(e.v, 2)} / (π·${fmt(Dm, 3)})`,
    `M = ${fmt(par, 0)} N·m ;  n = ${fmt(nTambor, 1)} rpm`,
    `Con un motor de 4 polos (≈1450 rpm) la relación de reducción sería i ≈ ${fmt(iReductor, 1)}.`);

  // ================= PASO 4: TENSIONES (EULER-EYTELWEIN) =================
  paso("Factor de Euler-Eytelwein", "e^(μ·θ)",
    `e^(${fmt(e.mu, 2)} · ${fmt(e.theta * RAD, 4)} rad)`, fmt(eMuTheta, 3));
  paso("Tensión mínima para que no deslice la banda", "T₂ ≥ F_U / (e^(μθ) − 1)",
    `T₂ ≥ ${fmt(Fu, 0)} / (${fmt(eMuTheta, 3)} − 1)`, `${fmt(T2E, 0)} N`);
  paso("Tensión mínima por flecha en el ramal de carga", "T₀ = (q_B + q_G)·g·a_o / (8 · h/a)",
    `T₀ = (${fmt(qB, 2)} + ${fmt(qG, 2)})·${fmt(g, 2)}·${fmt(e.ao, 2)} / (8 · ${fmt(s, 3)})`,
    `${fmt(T0c, 0)} N`, `En la cola: T₃ = T₂ + F_ret ≥ T₀  →  T₂ ≥ ${fmt(T0c - Fret, 0)} N`);
  paso("Tensión mínima por flecha en el ramal de retorno", "T_r = q_B·g·a_u / (8 · h/a)",
    `T_r = ${fmt(qB, 2)}·${fmt(g, 2)}·${fmt(e.au, 2)} / (8 · ${fmt(s, 3)})`, `${fmt(T0r, 0)} N`);
  paso("Tensión del ramal flojo adoptada", "T₂ = máx(condiciones anteriores)",
    "", `${fmt(T2, 0)} N`, `Gobierna: ${gobierna.criterio}.`);
  paso("Tensión del ramal tenso (máxima)", "T₁ = T₂ + F_U",
    `T₁ = ${fmt(T2, 0)} + ${fmt(Fu, 0)}`, `${fmt(T1, 0)} N`);
  paso("Tensión en el tambor de cola", "T₃ = T₄ = T₂ + F_ret",
    `T₃ = ${fmt(T2, 0)} + ${fmtS(Fret, 0)}`, `${fmt(T3, 0)} N`);
  paso("Comprobación de adherencia", "T₁ / T₂ ≤ e^(μθ)",
    `${fmt(T1, 0)} / ${fmt(T2, 0)} = ${fmt(T1 / T2, 3)} ≤ ${fmt(eMuTheta, 3)}`,
    T1 / T2 <= eMuTheta + 1e-9 ? "CUMPLE" : "NO CUMPLE");

  // ================= PASO 5: BANDA =================
  const kN_m = T1 / Bm / 1000; // kN/m = N/mm
  paso("Tensión unitaria máxima", "k = T₁ / B",
    `k = ${fmt(T1, 0)} N / ${B} mm`, `${fmt(kN_m, 2)} N/mm`);
  paso("Número de telas necesario", "n ≥ T₁ · CS / (B[cm] · R_tela)",
    `n ≥ ${fmt(T1, 0)} · ${fmt(e.FS, 1)} / (${fmt(B / 10, 0)} cm · ${tejido.resistenciaKgfCm} kgf/cm · ${fmt(g, 2)})`,
    `${fmt((T1 * e.FS) / ((B / 10) * resistenciaTela), 2)}  →  n = ${n} telas ${tejido.codigo}`,
    `Calidad de tejido ${tejido.codigo}: ${tejido.resistenciaKgfCm} kgf/cm por tela (UNE 18025). Mínimo de ${P.banda.telasMin} telas.`);
  const csReal = (B / 10) * resistenciaTela * n / T1;
  paso("Coeficiente de seguridad real de la banda", "CS_real = n · B[cm] · R_tela / T₁",
    `CS_real = ${n} · ${fmt(B / 10, 0)} · ${fmt(resistenciaTela, 1)} / ${fmt(T1, 0)}`, fmt(csReal, 2));

  const Ldes = 2 * e.L + Math.PI * Dm;
  const LdesR = Math.ceil(Ldes);
  paso("Desarrollo (longitud total) de la banda", "L_des = 2·L + π·D",
    `L_des = 2·${fmt(e.L, 1)} + π·${fmt(Dm, 3)}`, `${fmt(Ldes, 2)} m  →  ${LdesR} m`,
    "Supone tambor motriz y de cola del mismo diámetro. Añadir la longitud de empalme y del tensor.");

  const designacion = `${B} ${e.calidadRec} – ${n}${tejido.codigo}/${Math.round(e.eSup * 10)}-${Math.round(e.eInf * 10)} des${LdesR} UNE 18025`;

  // ================= AVISOS Y RECOMENDACIONES (apuntes de la asignatura) =================
  if (llenado <= 1) aviso("ok", `Capacidad suficiente: grado de llenado ${fmt(llenado * 100, 1)} % (B = ${B} mm).`);
  if (T1 / T2 <= eMuTheta + 1e-9) aviso("ok", `No hay deslizamiento en el tambor: T₁/T₂ = ${fmt(T1 / T2, 3)} ≤ e^(μθ) = ${fmt(eMuTheta, 3)}.`);
  if (n > P.banda.telasMax) aviso("aviso", `Se necesitan ${n} telas (más de ${P.banda.telasMax}). Conviene una banda de cables de acero (St) o un tejido de mayor resistencia.`);

  const vmax = e.abrasividad ? P.velocidadMaxOrientativa[e.abrasividad] : null;
  if (vmax && e.v > vmax) aviso("aviso", `Velocidad alta para un material de abrasividad ${e.abrasividad}: se recomienda v ≤ ${fmt(vmax, 2)} m/s (criterio orientativo) para limitar el desgaste de la banda.`);
  if (e.delta > 5) aviso("info", "Con más de 5° de inclinación es necesario disponer una zona de carga horizontal bajo la tolva (apuntes).");
  if (e.delta > 18) aviso("aviso", "Inclinación elevada para banda lisa: comprobar la inclinación máxima admisible del material o usar banda con perfiles (nervios).");
  if (e.rho > 2.0) aviso("info", "Material de elevado peso específico: se aconsejan rodillos de impacto (recubiertos de goma) en la zona de carga.");
  if (e.ao < 1 || e.ao > 1.5) aviso("info", "Paso de rodillos de carga fuera del rango habitual de 1-1,5 m (apuntes).");
  if (e.au < 2 * e.ao - 1e-9 || e.au > 3 * e.ao + 1e-9) aviso("info", "El paso de los rodillos de retorno suele ser el doble o el triple que el de carga (apuntes).");
  if (e.diamRodillo < 100 || e.diamRodillo > 150) aviso("info", "Diámetro de rodillo fuera del rango aconsejable de 100-150 mm (apuntes).");
  if (e.aMax > 0 && e.aMax > B / 3) aviso("aviso", `Tamaño máximo de terrón (${e.aMax} mm) grande para B = ${B} mm: como criterio orientativo a_max ≤ B/3 = ${fmt(B / 3, 0)} mm.`);
  if (e.abrasividad === "C" && e.calidadRec !== "A") aviso("aviso", "Material muy abrasivo: se recomienda recubrimiento de calidad A (altamente resistente a la abrasión).");
  if (e.corrosividad === "C") aviso("info", "Material muy corrosivo: elegir un recubrimiento resistente a agentes químicos y proteger rodillos y bastidor.");
  if (llenado <= 1 && llenado < 0.5 && !e.anchoFijo) aviso("info", `Grado de llenado bajo (${fmt(llenado * 100, 1)} %): podrías reducir la velocidad o el ángulo de artesa.`);
  if (e.tipo === "plana") aviso("info", "La estación plana es adecuada para cargas unitarias o caudales pequeños; para graneles es preferible la artesa.");

  return {
    ok: true, entrada: e,
    IM, K, IVM, IVTreq, listaAnchos, fila, B, llenado, QmaxB,
    H, qG, qRO, qRU, mRO, mRU, C, qB, masaBandaM2, n, nNec,
    Fcarga, Fret, Fu, PA, PM, motor, par, nTambor, iReductor,
    eMuTheta, T2E, T0c, T0r, T1, T2, T3, gobierna, kN_m, csReal,
    Ldes, LdesR, designacion, tejido, pasos, avisos
  };
}

// Permite usar el motor de cálculo desde Node.js (verificación independiente).
if (typeof module !== "undefined" && module.exports) {
  module.exports = { calcularCinta, interpolar, clasificarFluidez, fmt };
}

/* ---------------------------------------------------------------------
   3. INTERFAZ
   --------------------------------------------------------------------- */
if (typeof document !== "undefined") {

  const $ = id => document.getElementById(id);
  const DATOS = {};
  let ultimo = null;

  async function cargarJSON(nombre) {
    const r = await fetch(nombre);
    if (!r.ok) throw new Error("No se pudo leer " + nombre);
    return r.json();
  }

  async function iniciar() {
    try {
      const [m, c, p] = await Promise.all([
        cargarJSON("materiales.json"), cargarJSON("capacidades.json"), cargarJSON("parametros.json")
      ]);
      DATOS.materiales = m; DATOS.capacidades = c; DATOS.parametros = p;
      rellenarControles();
      enlazarEventos();
      cargarEjemplo();
    } catch (err) {
      $("estado-carga").textContent = "No se pudieron cargar los archivos JSON. Abre la web con un servidor local (py -m http.server 8000) o desde GitHub Pages.";
      console.error(err);
    }
  }

  // ---- Rellenar listas desplegables a partir de los JSON ----
  function opcion(sel, valor, texto) {
    const o = document.createElement("option");
    o.value = valor; o.textContent = texto; sel.appendChild(o); return o;
  }

  function rellenarMateriales(filtro = "") {
    const sel = $("material");
    const actual = sel.value;
    sel.innerHTML = "";
    opcion(sel, "personalizado", "✎ Material personalizado (introducir propiedades)");
    const f = filtro.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    DATOS.materiales.materiales
      .filter(mt => !f || mt.nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(f))
      .forEach(mt => opcion(sel, mt.id, mt.nombre));
    if ([...sel.options].some(o => o.value === actual)) sel.value = actual;
    else if (sel.options.length > 1) sel.selectedIndex = 1;
  }

  function rellenarControles() {
    const P = DATOS.parametros;
    rellenarMateriales();
    P.factorAlimentacionK1.opciones.forEach(o => opcion($("K1"), o.K1, `${o.nombre} (K₁ = ${fmt(o.K1, 2)})`));
    P.coeficienteRozamientoF.opciones.forEach(o => opcion($("f"), o.f, `${o.nombre} (f = ${fmt(o.f, 3)})`));
    P.rozamientoTambor.opciones.forEach(o => opcion($("mu"), o.mu, `${o.nombre} (μ = ${fmt(o.mu, 2)})`));
    P.angulosAbrazamiento.opciones.forEach(o => opcion($("theta"), o.grados, o.nombre));
    P.calidadTejido.opciones.forEach(o => opcion($("tejido"), o.codigo, `${o.nombre} (${o.resistenciaKgfCm} kgf/cm)`));
    P.calidadRecubrimiento.opciones.forEach(o => opcion($("calidadRec"), o.codigo, o.nombre));
    P.rodillos.diametros.forEach(d => opcion($("diamRodillo"), d, `Ø ${d} mm`));
    P.diametrosTambor.forEach(d => opcion($("Dtambor"), d, `Ø ${d} mm`));
    const dl = $("velocidades");
    P.velocidadesNormalizadas.forEach(v => { const o = document.createElement("option"); o.value = v; dl.appendChild(o); });
    const chips = $("chips-velocidad");
    P.velocidadesNormalizadas.forEach(v => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "chip"; b.textContent = fmt(v, 2);
      b.addEventListener("click", () => { $("v").value = v; $("v-rango").value = v; recalcular(); });
      chips.appendChild(b);
    });
    actualizarLambdas();
  }

  // Ángulos de artesa y anchos disponibles según el tipo de estación
  function tipoActual() { return document.querySelector('input[name="tipo"]:checked').value; }

  function actualizarLambdas() {
    const tipo = DATOS.capacidades.tipos[tipoActual()];
    const selL = $("lambda");
    const prevL = selL.value;
    selL.innerHTML = "";
    tipo.angulosArtesa.forEach(l => opcion(selL, l, l === 0 ? "0° (plana)" : (l === "30/60" ? "λ₁ = 30° / λ₂ = 60°" : `${l}°`)));
    if ([...selL.options].some(o => o.value === prevL)) selL.value = prevL;
    else if (tipo.angulosArtesa.includes(30)) selL.value = "30";
    selL.disabled = tipo.angulosArtesa.length === 1;

    const selB = $("anchoFijo");
    const prevB = selB.value;
    selB.innerHTML = "";
    opcion(selB, "0", "Automático (el menor que cumple)");
    tipo.anchos.forEach(b => opcion(selB, b, `${b} mm`));
    selB.value = [...selB.options].some(o => o.value === prevB) ? prevB : "0";
    $("rango-anchos").textContent = `Tab. ${tipo.tabla}: anchos de ${tipo.anchos[0]} a ${tipo.anchos[tipo.anchos.length - 1]} mm.`;
  }

  // ---- Material: rellena ficha y propone densidad y β ----
  function materialActual() {
    const id = $("material").value;
    if (id === "personalizado") return null;
    return DATOS.materiales.materiales.find(m => m.id === id);
  }

  function alSeleccionarMaterial() {
    const mt = materialActual();
    const P = DATOS.parametros;
    const pers = !mt;
    $("bloque-personalizado").hidden = !pers;
    const rho = $("rho"), rhoR = $("rho-rango");
    if (mt) {
      rho.min = rhoR.min = mt.densidadMin;
      rho.max = rhoR.max = mt.densidadMax;
      rho.value = rhoR.value = mt.densidadMin;
      rhoR.disabled = mt.densidadMin === mt.densidadMax;
      $("rho-ayuda").textContent = mt.densidadMin === mt.densidadMax
        ? `Valor único en la tabla: ${fmt(mt.densidadMin, 3)} t/m³.`
        : `Rango de la tabla: ${fmt(mt.densidadMin, 2)} - ${fmt(mt.densidadMax, 2)} t/m³. Para dimensionar el ancho es más desfavorable el valor mínimo (más volumen).`;
    } else {
      rho.min = rhoR.min = 0.05; rho.max = rhoR.max = 5; rhoR.disabled = false;
      $("rho-ayuda").textContent = "Introduce el peso específico aparente del material.";
    }
    const alfa = mt ? (mt.anguloReposoMin === null ? null : (mt.anguloReposoMin + mt.anguloReposoMax) / 2) : Number($("alfa-pers").value);
    const clase = clasificarFluidez(alfa, P);
    $("beta").value = clase ? clase.betaRecomendado : 20;
    pintarFichaMaterial();
    recalcular();
  }

  function propiedadesMaterial() {
    const mt = materialActual();
    if (mt) {
      const alfa = mt.anguloReposoMin === null ? null : (mt.anguloReposoMin + mt.anguloReposoMax) / 2;
      return { nombre: mt.nombre, alfa, alfaTxt: mt.anguloReposoMin === null ? "sin dato" :
        (mt.anguloReposoMin === mt.anguloReposoMax ? `${mt.anguloReposoMin}°` : `${mt.anguloReposoMin}°-${mt.anguloReposoMax}°`),
        abrasividad: mt.abrasividad, corrosividad: mt.corrosividad };
    }
    const a = $("alfa-pers").value === "" ? null : Number($("alfa-pers").value);
    return { nombre: $("nombre-pers").value || "Material personalizado", alfa: a, alfaTxt: a === null ? "sin dato" : `${a}°`,
      abrasividad: $("abras-pers").value || null, corrosividad: $("corros-pers").value || null };
  }

  function pintarFichaMaterial() {
    const pm = propiedadesMaterial();
    const P = DATOS.parametros;
    const clase = clasificarFluidez(pm.alfa, P);
    const ley = DATOS.materiales.leyenda;
    const badge = (letra, tipo) => letra ? `<span class="badge nivel-${letra}" title="${ley[letra]}">${tipo} ${letra}</span>` : `<span class="badge">${tipo}: sin dato</span>`;
    $("ficha-material").innerHTML = `
      <div><span class="mini">Ángulo de reposo α</span><strong>${pm.alfaTxt}</strong></div>
      <div><span class="mini">Fluidez</span><strong>${clase ? clase.nombre : "—"}</strong></div>
      <div><span class="mini">β recomendado</span><strong>${clase ? clase.betaTexto : "elegir"}</strong></div>
      <div class="badges">${badge(pm.abrasividad, "Abrasividad")} ${badge(pm.corrosividad, "Corrosividad")}</div>
      <p class="ayuda full">${clase ? clase.descripcion + "." : "La tabla no da el ángulo de reposo: elige el ángulo de sobrecarga β según la fluidez del material."}</p>`;
  }

  // Al cambiar de material, propone recubrimientos según la abrasividad
  function proponerRecubrimientos() {
    const pm = propiedadesMaterial();
    const rec = DATOS.parametros.calidadRecubrimiento.recomendacionPorAbrasividad[pm.abrasividad || "B"];
    $("calidadRec").value = rec.calidad;
    $("eSup").value = rec.superiorMm;
    $("eInf").value = rec.inferiorMm;
  }

  // ---- Lectura de todos los controles ----
  function num(id) { return Number(String($(id).value).replace(",", ".")); }

  function leerEntrada() {
    const pm = propiedadesMaterial();
    return {
      material: pm.nombre,
      abrasividad: pm.abrasividad, corrosividad: pm.corrosividad, alfa: pm.alfa,
      Q: num("Q"), v: num("v"), L: num("L"), delta: num("delta"), rho: num("rho"),
      beta: num("beta"), tipo: tipoActual(), lambda: $("lambda").value === "30/60" ? "30/60" : num("lambda"),
      anchoFijo: num("anchoFijo"), K1: num("K1"), aMax: num("aMax") || 0,
      ao: num("ao"), au: num("au"), diamRodillo: num("diamRodillo"),
      mRO: $("mRO").value === "" ? 0 : num("mRO"), mRU: $("mRU").value === "" ? 0 : num("mRU"),
      f: num("f"), Cmanual: $("Cmanual").value === "" ? 0 : num("Cmanual"),
      mu: num("mu"), theta: num("theta"), eta: num("eta"),
      tejido: $("tejido").value, FS: num("FS"), eSup: num("eSup"), eInf: num("eInf"),
      calidadRec: $("calidadRec").value, Dtambor: num("Dtambor")
    };
  }

  // ---- Recalcular y presentar ----
  function recalcular() {
    if (!DATOS.parametros) return;
    pintarFichaMaterial();
    const e = leerEntrada();
    const r = calcularCinta(e, DATOS);
    ultimo = r;
    ANIM.e = e; ANIM.r = r;
    const err = $("error");
    if (r.error) {
      err.textContent = r.error; err.hidden = false;
      $("resultados").classList.add("atenuado");
      dibujarSeccion(e, null);
      if (r.listaAnchos) dibujarCapacidad(e, { listaAnchos: r.listaAnchos, B: null, entrada: e });
      return;
    }
    err.hidden = true;
    $("resultados").classList.remove("atenuado");
    pintarResultados(r);
    dibujarSeccion(e, r);
    dibujarCapacidad(e, r);
    dibujarTensiones(e, r);
    dibujarParametrico(e);
  }

  function pintarResultados(r) {
    $("kpi-ancho").textContent = `${r.B} mm`;
    $("kpi-ancho-sub").textContent = `Llenado ${fmt(r.llenado * 100, 1)} %`;
    $("kpi-capacidad").textContent = `${fmt(r.QmaxB, 0)} t/h`;
    $("kpi-capacidad-sub").textContent = `Necesaria ${fmt(r.entrada.Q, 0)} t/h`;
    $("kpi-potencia").textContent = r.motor ? `${fmt(r.motor, r.motor < 1 ? 2 : 1)} kW` : "> catálogo";
    $("kpi-potencia-sub").textContent = `Necesaria ${fmt(r.PM / 1000, 2)} kW`;
    $("kpi-tension").textContent = `${fmt(r.T1 / 1000, 2)} kN`;
    $("kpi-tension-sub").textContent = `T₂ = ${fmt(r.T2 / 1000, 2)} kN`;
    $("kpi-banda").textContent = `${r.n} telas ${r.tejido.codigo}`;
    $("kpi-banda-sub").textContent = `CS real = ${fmt(r.csReal, 1)}`;
    $("designacion").textContent = r.designacion;

    const barra = $("barra-llenado");
    barra.style.width = Math.min(100, r.llenado * 100) + "%";
    barra.className = "relleno " + (r.llenado > 1 ? "mal" : r.llenado > 0.9 ? "justo" : "bien");

    // Tabla de resultados resumida
    const filas = [
      ["Caudal volumétrico I_M", `${fmt(r.IM, 2)} m³/h`],
      ["Factor de inclinación K", fmt(r.K, 3)],
      ["I_VT necesaria (v = 1 m/s)", `${fmt(r.IVTreq, 2)} m³/h`],
      [`I_VT tabla (B = ${r.B} mm)`, `${fmt(r.fila.IVT, 1)} m³/h`],
      ["Altura H", `${fmt(r.H, 2)} m`],
      ["q_G · q_B · q_RO · q_RU", `${fmt(r.qG, 1)} · ${fmt(r.qB, 1)} · ${fmt(r.qRO, 1)} · ${fmt(r.qRU, 1)} kg/m`],
      ["Coeficiente C", fmt(r.C, 3)],
      ["Fuerza tangencial F_U", `${fmt(r.Fu, 0)} N`],
      ["Potencia en tambor P_A", `${fmt(r.PA / 1000, 2)} kW`],
      ["Potencia motor P_M", `${fmt(r.PM / 1000, 2)} kW`],
      ["Par en el tambor", `${fmt(r.par, 0)} N·m (${fmt(r.nTambor, 1)} rpm)`],
      ["e^(μθ)", fmt(r.eMuTheta, 3)],
      ["T₁ / T₂ / T₃", `${fmt(r.T1, 0)} / ${fmt(r.T2, 0)} / ${fmt(r.T3, 0)} N`],
      ["Tensión unitaria T₁/B", `${fmt(r.kN_m, 2)} N/mm`],
      ["Desarrollo de banda", `${fmt(r.Ldes, 2)} m`]
    ];
    $("tabla-resumen").innerHTML = filas.map(([a, b]) => `<tr><th>${a}</th><td>${b}</td></tr>`).join("");

    // Avisos
    const iconos = { ok: "✔", aviso: "⚠", error: "✖", info: "ℹ" };
    const orden = { error: 0, aviso: 1, ok: 2, info: 3 };
    $("avisos").innerHTML = [...r.avisos].sort((a, b) => orden[a.nivel] - orden[b.nivel])
      .map(a => `<li class="av-${a.nivel}"><span>${iconos[a.nivel]}</span>${a.texto}</li>`).join("");

    // Memoria de cálculo
    $("memoria").innerHTML = r.pasos.map((p, i) => `
      <li>
        <div class="paso-titulo"><span class="paso-num">${i + 1}</span>${p.titulo}</div>
        <div class="paso-formula">${p.formula}</div>
        ${p.sustitucion ? `<div class="paso-sust">${p.sustitucion}</div>` : ""}
        <div class="paso-res">= <strong>${p.resultado}</strong></div>
        ${p.nota ? `<div class="paso-nota">${p.nota}</div>` : ""}
      </li>`).join("");

    // Datos para el informe impreso
    const e = r.entrada;
    $("informe-datos").textContent =
      `${e.material} · q_s = ${fmt(e.rho, 3)} t/m³ · β = ${e.beta}° · Q = ${fmt(e.Q, 1)} t/h · v = ${fmt(e.v, 2)} m/s · ` +
      `L = ${fmt(e.L, 1)} m · δ = ${fmt(e.delta, 1)}° · ${DATOS.capacidades.tipos[e.tipo].nombre}, λ = ${e.lambda}°`;
  }

  /* -------------------------------------------------------------------
     4. DIBUJOS EN CANVAS
     ------------------------------------------------------------------- */
  const COL = {
    texto: "#1f2937", suave: "#6b7280", rejilla: "#e5e7eb", banda: "#111827",
    rodillo: "#94a3b8", rodilloBorde: "#475569", material: "#c08a4a", materialBorde: "#8a5a26",
    acento: "#0f6cbd", ok: "#15803d", mal: "#b91c1c", aviso: "#b45309"
  };

  function prepararCanvas(cv) {
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth || cv.parentElement.clientWidth;
    const h = Number(cv.dataset.alto || 300);
    cv.style.height = h + "px";
    const W = Math.round(w * dpr), Hh = Math.round(h * dpr);
    if (cv.width !== W || cv.height !== Hh) { cv.width = W; cv.height = Hh; } // solo si cambia el tamaño
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = "13px Arial";
    return { ctx, w, h };
  }

  // Geometría de la banda en artesa: polilínea de puntos (en metros), centrada en x = 0
  function contornoBanda(tipo, lambda, Bm) {
    const segs = [];
    if (tipo === "plana") segs.push({ l: Bm, a: 0 });
    else if (tipo === "dos") { segs.push({ l: Bm / 2, a: lambda }, { l: Bm / 2, a: -lambda }); }
    else if (tipo === "tres") { const lc = Bm / 3; segs.push({ l: lc, a: lambda }, { l: lc, a: 0 }, { l: lc, a: -lambda }); }
    else { const lc = Bm / 5; segs.push({ l: lc, a: 60 }, { l: lc, a: 30 }, { l: lc, a: 0 }, { l: lc, a: -30 }, { l: lc, a: -60 }); }
    // Recorremos de izquierda a derecha, "a" positivo = baja hacia el centro
    let x = 0, y = 0;
    const pts = [{ x, y }];
    segs.forEach(sg => { x += sg.l * Math.cos(sg.a * RAD); y -= sg.l * Math.sin(sg.a * RAD); pts.push({ x, y }); });
    // centrar y poner bordes en y = 0
    const xc = x / 2, ymin = Math.min(...pts.map(p => p.y));
    return { pts: pts.map(p => ({ x: p.x - xc, y: p.y })), segs, profundidad: -ymin };
  }

  function puntoEnPolilinea(pts, sObj) {
    let s = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
      const l = Math.hypot(dx, dy);
      if (s + l >= sObj) { const t = (sObj - s) / l; return { x: pts[i - 1].x + t * dx, y: pts[i - 1].y + t * dy, i }; }
      s += l;
    }
    return { ...pts[pts.length - 1], i: pts.length - 1 };
  }

  function dibujarSeccion(e, r) {
    const cv = $("canvas-seccion");
    const { ctx, w, h } = prepararCanvas(cv);
    const Bm = r ? r.B / 1000 : 1;
    const lam = e.lambda === "30/60" ? 30 : Number(e.lambda);
    const geo = contornoBanda(e.tipo, lam, Bm);
    const beta = Number(e.beta) * RAD;
    // ancho útil cargado (DIN 22101): b = 0,9·B − 0,05 (B ≤ 2 m) ; b = B − 0,25 (B > 2 m)
    const b = Bm <= 2 ? 0.9 * Bm - 0.05 : Bm - 0.25;
    const sTot = Bm, s0 = (sTot - b) / 2, s1 = s0 + b;
    const pA = puntoEnPolilinea(geo.pts, s0), pB = puntoEnPolilinea(geo.pts, s1);
    const cuerda = pB.x - pA.x;
    const alturaControl = (cuerda / 2) * Math.tan(beta);

    const anchoX = Math.max(...geo.pts.map(p => p.x)) * 2;
    const alto = geo.profundidad + alturaControl / 2 + 0.15 * Bm;
    const esc = Math.min((w - 90) / anchoX, (h - 90) / (alto + 0.12 * Bm));
    const ox = w / 2, oy = 45 + (alturaControl / 2 + 0.05 * Bm) * esc;
    const X = x => ox + x * esc, Y = y => oy - y * esc;

    // material
    ctx.beginPath();
    ctx.moveTo(X(pA.x), Y(pA.y));
    for (let i = pA.i; i < pB.i; i++) ctx.lineTo(X(geo.pts[i].x), Y(geo.pts[i].y));
    ctx.lineTo(X(pB.x), Y(pB.y));
    const ymedio = (pA.y + pB.y) / 2;
    ctx.quadraticCurveTo(X(0), Y(ymedio + alturaControl), X(pA.x), Y(pA.y));
    ctx.closePath();
    ctx.fillStyle = COL.material; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = COL.materialBorde; ctx.lineWidth = 1.5; ctx.stroke();

    // rodillos (rectángulos redondeados bajo cada tramo)
    const rr = Math.max(7, Math.min(16, 0.06 * Bm * esc));
    for (let i = 1; i < geo.pts.length; i++) {
      const a = geo.pts[i - 1], c = geo.pts[i];
      const ang = Math.atan2(Y(c.y) - Y(a.y), X(c.x) - X(a.x));
      const len = Math.hypot(X(c.x) - X(a.x), Y(c.y) - Y(a.y));
      ctx.save();
      ctx.translate((X(a.x) + X(c.x)) / 2, (Y(a.y) + Y(c.y)) / 2);
      ctx.rotate(ang);
      ctx.translate(0, rr + 3);
      ctx.fillStyle = COL.rodillo; ctx.strokeStyle = COL.rodilloBorde; ctx.lineWidth = 1.2;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-len * 0.46, -rr, len * 0.92, 2 * rr, rr); else ctx.rect(-len * 0.46, -rr, len * 0.92, 2 * rr);
      ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-len * 0.46 - 6, 0); ctx.lineTo(len * 0.46 + 6, 0); ctx.strokeStyle = COL.rodilloBorde; ctx.stroke();
      ctx.restore();
    }

    // banda
    ctx.beginPath();
    geo.pts.forEach((p, i) => i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y)));
    ctx.strokeStyle = COL.banda; ctx.lineWidth = 4; ctx.lineJoin = "round"; ctx.stroke();

    // cotas: ancho B y β
    const yCota = Y(-geo.profundidad) + 2 * rr + 30;
    const xi = X(geo.pts[0].x), xf = X(geo.pts[geo.pts.length - 1].x);
    ctx.strokeStyle = COL.suave; ctx.fillStyle = COL.texto; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(xi, yCota); ctx.lineTo(xf, yCota); ctx.stroke();
    [xi, xf].forEach(x => { ctx.beginPath(); ctx.moveTo(x, yCota - 5); ctx.lineTo(x, yCota + 5); ctx.stroke(); });
    ctx.textAlign = "center";
    ctx.fillText(r ? `B = ${r.B} mm` : "B = ?", (xi + xf) / 2, yCota + 17);

    // línea de β en el borde derecho
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(X(pB.x), Y(pB.y)); ctx.lineTo(X(pB.x) - 0.28 * cuerda * esc, Y(pB.y)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(X(pB.x), Y(pB.y), 34, Math.PI, Math.PI + beta); ctx.stroke();
    ctx.textAlign = "right"; ctx.font = "bold 13px Arial";
    ctx.lineWidth = 4; ctx.strokeStyle = "#fff"; ctx.strokeText(`β = ${e.beta}°`, X(pB.x) - 40, Y(pB.y) - 10);
    ctx.fillStyle = COL.texto; ctx.fillText(`β = ${e.beta}°`, X(pB.x) - 40, Y(pB.y) - 10);
    ctx.font = "13px Arial"; ctx.lineWidth = 1;

    if (e.tipo !== "plana") {
      ctx.textAlign = "left";
      ctx.fillStyle = COL.suave;
      ctx.fillText(e.lambda === "30/60" ? "λ₁ = 30°, λ₂ = 60°" : `λ = ${e.lambda}°`, 12, h - 14);
    }
    ctx.textAlign = "right"; ctx.fillStyle = COL.suave;
    ctx.fillText(DATOS.capacidades.tipos[e.tipo].nombre, w - 12, h - 14);
  }

  function dibujarCapacidad(e, r) {
    const cv = $("canvas-capacidad");
    const { ctx, w, h } = prepararCanvas(cv);
    const lista = r.listaAnchos;
    const iSel = r.B ? lista.findIndex(a => a.B === r.B) : lista.length - 1;
    // mostramos desde 2 anchos antes de la selección hasta 3 después
    const i0 = Math.max(0, iSel - 3), i1 = Math.min(lista.length, iSel + 4);
    const vis = lista.slice(i0, i1);
    const Qn = e.Q;
    const maxY = Math.max(Qn, ...vis.map(a => a.Qmax)) * 1.15;
    const m = { izq: 62, der: 16, sup: 22, inf: 44 };
    const ancho = w - m.izq - m.der, alto = h - m.sup - m.inf;
    const Y = v => m.sup + alto - (v / maxY) * alto;

    // rejilla
    ctx.textAlign = "right"; ctx.fillStyle = COL.suave;
    for (let k = 0; k <= 4; k++) {
      const v = maxY * k / 4;
      ctx.strokeStyle = COL.rejilla; ctx.beginPath(); ctx.moveTo(m.izq, Y(v)); ctx.lineTo(w - m.der, Y(v)); ctx.stroke();
      ctx.fillText(fmt(v, 0), m.izq - 8, Y(v) + 4);
    }
    ctx.save(); ctx.translate(14, m.sup + alto / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center";
    ctx.fillText("Capacidad máx. (t/h)", 0, 0); ctx.restore();

    const paso = ancho / vis.length;
    const bw = Math.min(56, paso * 0.62);
    vis.forEach((a, k) => {
      const x = m.izq + paso * k + (paso - bw) / 2;
      const sel = a.B === r.B;
      ctx.fillStyle = sel ? COL.acento : (a.cumple ? "#9cc3e6" : "#d1d5db");
      ctx.fillRect(x, Y(a.Qmax), bw, Y(0) - Y(a.Qmax));
      ctx.fillStyle = COL.texto; ctx.textAlign = "center";
      ctx.font = sel ? "bold 12px Arial" : "12px Arial";
      ctx.fillText(fmt(a.Qmax, 0), x + bw / 2, Y(a.Qmax) - 6);
      ctx.fillText(String(a.B), x + bw / 2, h - m.inf + 17);
      if (a.sospechoso) { ctx.fillStyle = COL.aviso; ctx.fillText("⚠", x + bw / 2, Y(a.Qmax) - 21); }
    });
    ctx.font = "13px Arial"; ctx.fillStyle = COL.suave; ctx.textAlign = "center";
    ctx.fillText("Ancho de banda B (mm)", m.izq + ancho / 2, h - 8);

    // línea de caudal necesario
    ctx.strokeStyle = COL.mal; ctx.lineWidth = 2; ctx.setLineDash([7, 5]);
    ctx.beginPath(); ctx.moveTo(m.izq, Y(Qn)); ctx.lineTo(w - m.der, Y(Qn)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = COL.mal; ctx.textAlign = "left"; ctx.font = "bold 12px Arial";
    ctx.fillText(`Q necesario = ${fmt(Qn, 0)} t/h`, m.izq + 6, Y(Qn) - 6);
    ctx.font = "13px Arial"; ctx.lineWidth = 1;
  }

  function flecha(ctx, x1, y1, x2, y2, color) {
    const a = Math.atan2(y2 - y1, x2 - x1);
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 10 * Math.cos(a - 0.4), y2 - 10 * Math.sin(a - 0.4));
    ctx.lineTo(x2 - 10 * Math.cos(a + 0.4), y2 - 10 * Math.sin(a + 0.4));
    ctx.closePath(); ctx.fill();
  }

  function dibujarTensiones(e, r) {
    const cv = $("canvas-tensiones");
    const { ctx, w, h } = prepararCanvas(cv);
    const angVis = Math.max(e.delta, 0) * RAD; // inclinación real
    const m = 70;
    const largo = Math.min((w - 2 * m) / Math.cos(angVis), (h - 120) / Math.max(Math.sin(angVis), 0.0001));
    const x0 = m, y0 = h - 55;
    const x1 = x0 + largo * Math.cos(angVis), y1 = y0 - largo * Math.sin(angVis);
    const R = 22;
    const nx = Math.sin(angVis), ny = Math.cos(angVis); // normal hacia arriba (y de pantalla invertida)

    // suelo y cota de altura
    ctx.strokeStyle = COL.rejilla; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(20, y0 + R + 14); ctx.lineTo(w - 20, y0 + R + 14); ctx.stroke();

    // ramal de carga (superior) y retorno (inferior)
    ctx.strokeStyle = COL.banda; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x0 - nx * R, y0 - ny * R); ctx.lineTo(x1 - nx * R, y1 - ny * R); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0 + nx * R, y0 + ny * R); ctx.lineTo(x1 + nx * R, y1 + ny * R); ctx.stroke();

    // material sobre el ramal de carga
    ctx.fillStyle = COL.material; ctx.globalAlpha = 0.8;
    const nM = 9;
    for (let k = 1; k < nM; k++) {
      const t = k / nM;
      const cx = x0 + t * (x1 - x0) - nx * (R + 8), cy = y0 + t * (y1 - y0) - ny * (R + 8);
      ctx.beginPath(); ctx.ellipse(cx, cy, 16, 7, -angVis, Math.PI, 2 * Math.PI); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // tambores
    [[x0, y0, "Tambor de cola"], [x1, y1, "Tambor motriz"]].forEach(([x, y, t], i) => {
      ctx.fillStyle = i ? COL.acento : COL.rodillo; ctx.strokeStyle = COL.rodilloBorde; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, R, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y, 4, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = COL.suave; ctx.font = "12px Arial";
      if (i) { ctx.textAlign = "right"; ctx.fillText(t, x + R + 42, y - R - 10); }
      else { ctx.textAlign = "center"; ctx.fillText(t, x, y + R + 30); }
    });
    // motor
    ctx.fillStyle = "#334155";
    ctx.fillRect(x1 + R + 8, y1 - 12, 34, 24);
    ctx.fillStyle = "#fff"; ctx.font = "bold 11px Arial"; ctx.textAlign = "center"; ctx.fillText("M", x1 + R + 25, y1 + 4);

    // flechas de tensiones
    const ux = Math.cos(angVis), uy = -Math.sin(angVis);
    const L = 46;
    const etiqueta = (txt, x, y, col, al = "center") => {
      ctx.font = "bold 13px Arial"; ctx.textAlign = al;
      ctx.lineWidth = 4; ctx.strokeStyle = "#fff"; ctx.strokeText(txt, x, y);
      ctx.fillStyle = col; ctx.fillText(txt, x, y); ctx.lineWidth = 1;
    };
    // T1: ramal tenso llegando al motriz (arriba, cabeza)
    const pT1 = { x: x1 - nx * R - ux * 60, y: y1 - ny * R - uy * 60 };
    flecha(ctx, pT1.x - ux * L, pT1.y - uy * L, pT1.x, pT1.y, COL.mal);
    etiqueta(`T₁ = ${fmt(r.T1 / 1000, 2)} kN`, pT1.x - ux * 30, pT1.y - 34, COL.mal);
    // T2: ramal flojo saliendo del motriz (abajo, cabeza)
    const pT2 = { x: x1 + nx * R - ux * 60, y: y1 + ny * R - uy * 60 };
    flecha(ctx, pT2.x, pT2.y, pT2.x - ux * L, pT2.y - uy * L, COL.acento);
    etiqueta(`T₂ = ${fmt(r.T2 / 1000, 2)} kN`, pT2.x - ux * 30, pT2.y + 26, COL.acento);
    // T3: retorno llegando a la cola
    const pT3 = { x: x0 + nx * R + ux * 60, y: y0 + ny * R + uy * 60 };
    flecha(ctx, pT3.x + ux * L, pT3.y + uy * L, pT3.x, pT3.y, COL.acento);
    etiqueta(`T₃ = ${fmt(r.T3 / 1000, 2)} kN`, pT3.x + ux * 25, pT3.y + 24, COL.acento);
    // T4: carga saliendo de la cola
    const pT4 = { x: x0 - nx * R + ux * 60, y: y0 - ny * R + uy * 60 };
    flecha(ctx, pT4.x, pT4.y, pT4.x + ux * L, pT4.y + uy * L, COL.texto);
    etiqueta(`T₄ = T₃`, pT4.x + ux * 20, pT4.y - 34, COL.texto);

    // datos generales
    ctx.font = "13px Arial"; ctx.fillStyle = COL.texto; ctx.textAlign = "left";
    ctx.fillText(`L = ${fmt(e.L, 1)} m · δ = ${fmt(e.delta, 1)}° · H = ${fmt(r.H, 2)} m`, 14, 20);
    ctx.fillText(`F_U = ${fmt(r.Fu / 1000, 2)} kN · e^(μθ) = ${fmt(r.eMuTheta, 3)} · T₁/T₂ = ${fmt(r.T1 / r.T2, 3)}`, 14, 38);
    ctx.fillStyle = COL.suave; ctx.font = "12px Arial";
    ctx.fillText("Sentido de avance: de la cola (izquierda) a la cabeza motriz (derecha)", 14, 56);
  }

  /* -------------------------------------------------------------------
     ANIMACIÓN: vista lateral de la cinta en movimiento
     - Inclinación real δ, rodillos de carga y retorno a su paso a_o y a_u
     - La banda avanza a una velocidad proporcional a v
     - La cantidad de material sobre la banda es proporcional al llenado
     - Descarga en cabeza en tiro parabólico (velocidad v, ángulo δ)
     ------------------------------------------------------------------- */
  const ANIM = { fase: 0, t: 0, ultimoT: null, pausa: false, e: null, r: null };

  // Pseudoaleatorio determinista (para que los terrones no "tiemblen")
  function aleat(i) { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); }

  function bucleAnimacion(ts) {
    if (ANIM.ultimoT === null) ANIM.ultimoT = ts;
    const dt = Math.min(0.05, (ts - ANIM.ultimoT) / 1000);
    ANIM.ultimoT = ts;
    if (!ANIM.pausa) ANIM.t += dt;
    dibujarCintaAnimada(ANIM.e, ANIM.r, ANIM.t);
    requestAnimationFrame(bucleAnimacion);
  }

  function dibujarCintaAnimada(e, r, t) {
    const cv = $("canvas-cinta");
    if (!cv || !e) return;
    const { ctx, w, h } = prepararCanvas(cv);
    const ok = r && r.ok;
    const ang = Math.max(0, Math.min(20, e.delta)) * RAD;
    const ux = Math.cos(ang), uy = -Math.sin(ang);      // dirección de avance (pantalla)
    const nx = Math.sin(ang), ny = Math.cos(ang);       // normal "hacia abajo" de la banda
    const R = 15;                                       // radio visual de los tambores
    const mIzq = 70, mDer = 120, mSup = 70, mInf = 48;
    const largo = Math.min((w - mIzq - mDer) / Math.cos(ang), (h - mSup - mInf) / Math.max(Math.sin(ang), 1e-6));
    const esc = largo / e.L;                            // px por metro a lo largo de la banda
    const x0 = mIzq, y0 = h - mInf;                     // eje del tambor de cola
    const x1 = x0 + largo * ux, y1 = y0 + largo * uy;   // eje del tambor motriz
    const P = s => ({ x: x0 + s * ux, y: y0 + s * uy }); // punto del eje a distancia s (px)

    // Velocidad visual: proporcional a v (limitada para que se vea bien)
    const vVis = Math.min(220, Math.max(14, e.v * 22));
    const fase = (t * vVis);

    // ---------- suelo y cotas ----------
    ctx.strokeStyle = "#e2e8f0"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(10, y0 + R + 12); ctx.lineTo(w - 10, y0 + R + 12); ctx.stroke();
    if (e.delta > 0.2) {
      ctx.setLineDash([4, 4]); ctx.strokeStyle = "#94a3b8";
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = COL.suave; ctx.font = "12px Arial"; ctx.textAlign = "left";
      ctx.fillText(`H = ${fmt(ok ? r.H : e.L * Math.sin(ang), 1)} m`, x1 + 6, (y0 + y1) / 2 + 30);
      ctx.beginPath(); ctx.strokeStyle = "#94a3b8"; ctx.arc(x0, y0, 70, -ang, 0); ctx.stroke();
      ctx.lineWidth = 4; ctx.strokeStyle = "#fff"; ctx.strokeText(`δ = ${fmt(e.delta, 1)}°`, x0 + 76, y0 + 4);
      ctx.fillText(`δ = ${fmt(e.delta, 1)}°`, x0 + 76, y0 + 4); ctx.lineWidth = 1;
    }

    // ---------- bastidor (patas) ----------
    ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 3;
    const nPatas = Math.max(2, Math.min(8, Math.round(largo / 140)));
    for (let k = 0; k <= nPatas; k++) {
      const p = P(largo * k / nPatas);
      ctx.beginPath(); ctx.moveTo(p.x, p.y + R + 2); ctx.lineTo(p.x, y0 + R + 12); ctx.stroke();
    }

    // ---------- rodillos de carga y de retorno a su paso real ----------
    const dibujarRodillos = (paso, lado, radio) => {
      const n = Math.floor(e.L / paso);
      const cada = Math.max(1, Math.ceil(n / 90));
      ctx.fillStyle = "#94a3b8"; ctx.strokeStyle = "#475569"; ctx.lineWidth = 1;
      for (let k = 1; k < n; k += cada) {
        const p = P(k * paso * esc);
        const cx = p.x + nx * lado * (R - radio), cy = p.y + ny * lado * (R - radio);
        ctx.beginPath(); ctx.arc(cx, cy, radio, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      }
      return n;
    };
    const nCarga = dibujarRodillos(e.ao, -1, 3.2);
    const nRet = dibujarRodillos(e.au, 1, 3.2);

    // ---------- banda (ramal superior e inferior) con marcas que avanzan ----------
    const ramal = (lado, sentido) => {
      const a = { x: x0 - nx * lado * R, y: y0 - ny * lado * R };
      const b = { x: x1 - nx * lado * R, y: y1 - ny * lado * R };
      ctx.strokeStyle = COL.banda; ctx.lineWidth = 3.5; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = "#64748b"; ctx.lineWidth = 1.5; ctx.setLineDash([3, 17]);
      ctx.lineDashOffset = -fase * sentido;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
    };
    ramal(1, 1);   // carga: avanza hacia la cabeza
    ramal(-1, -1); // retorno: vuelve hacia la cola

    // ---------- tambores (giran) ----------
    const giro = fase / R;
    [[x0, y0, false], [x1, y1, true]].forEach(([x, y, motriz]) => {
      ctx.fillStyle = motriz ? COL.acento : "#94a3b8"; ctx.strokeStyle = "#334155"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, R, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      for (let k = 0; k < 3; k++) {
        const a = giro + k * 2 * Math.PI / 3;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (R - 3), y + Math.sin(a) * (R - 3)); ctx.stroke();
      }
    });
    // motor-reductor
    ctx.fillStyle = "#334155"; ctx.fillRect(x1 + R + 6, y1 - 11, 30, 22);
    ctx.fillStyle = "#475569"; ctx.fillRect(x1 + R + 36, y1 - 8, 12, 16);
    ctx.fillStyle = "#fff"; ctx.font = "bold 11px Arial"; ctx.textAlign = "center";
    ctx.fillText("M", x1 + R + 21, y1 + 4);

    // ---------- tolva de carga en la cola ----------
    const sCarga = Math.min(60, largo * 0.08);
    const pc = P(sCarga);
    const topC = { x: pc.x - nx * R, y: pc.y - ny * R };
    ctx.fillStyle = "#e2e8f0"; ctx.strokeStyle = "#64748b"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(topC.x - 26, topC.y - 58); ctx.lineTo(topC.x + 26, topC.y - 58);
    ctx.lineTo(topC.x + 9, topC.y - 22); ctx.lineTo(topC.x - 9, topC.y - 22); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = COL.suave; ctx.font = "11px Arial"; ctx.textAlign = "center";
    ctx.fillText("Tolva", topC.x, topC.y - 63);

    if (ok) {
      const llen = Math.min(1.2, r.llenado);
      const colorMat = r.entrada.rho > 2 ? "#7c6f64" : (r.entrada.rho < 0.8 ? "#d9b26f" : COL.material);
      // material cayendo de la tolva
      ctx.fillStyle = colorMat;
      const nCaida = Math.round(4 + 8 * llen);
      for (let i = 0; i < nCaida; i++) {
        const q = ((t * 1.8 + i / nCaida) % 1);
        const px = topC.x + (aleat(i) - 0.5) * 12, py = topC.y - 22 + q * 18;
        ctx.beginPath(); ctx.arc(px, py, 1.8 + aleat(i + 7) * 1.5, 0, 2 * Math.PI); ctx.fill();
      }
      // capa de material sobre el ramal de carga (altura ∝ llenado)
      const hMax = 4 + 16 * llen;
      const sFin = largo;
      ctx.beginPath();
      const a0 = P(sCarga), a1 = P(sFin);
      ctx.moveTo(a0.x - nx * R, a0.y - ny * R);
      const pasos = 40;
      for (let k = 0; k <= pasos; k++) {
        const s = sCarga + (sFin - sCarga) * k / pasos;
        const rampa = Math.min(1, (s - sCarga) / 40);
        const ondula = 1 + 0.18 * Math.sin((s - fase) * 0.09);
        const hh = hMax * 0.55 * rampa * ondula;
        const p = P(s);
        ctx.lineTo(p.x - nx * (R + hh), p.y - ny * (R + hh));
      }
      ctx.lineTo(a1.x - nx * R, a1.y - ny * R); ctx.closePath();
      ctx.fillStyle = colorMat; ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1;
      // terrones que avanzan con la banda
      const tramo = sFin - sCarga;
      const nTerr = Math.round((tramo / 9) * Math.min(1, llen + 0.15));
      for (let i = 0; i < nTerr; i++) {
        const s = sCarga + ((i * tramo / nTerr + fase) % tramo);
        const rampa = Math.min(1, (s - sCarga) / 40);
        const rad = 1.8 + aleat(i) * 2.6;
        const alt = R + rad + aleat(i + 3) * hMax * 0.75 * rampa;
        const p = P(s);
        ctx.fillStyle = aleat(i + 11) > 0.5 ? colorMat : "#a8743a";
        ctx.beginPath(); ctx.arc(p.x - nx * alt, p.y - ny * alt, rad, 0, 2 * Math.PI); ctx.fill();
      }
      // descarga en cabeza: tiro parabólico con v y ángulo δ (escala local ampliada)
      const escTiro = 22; // px por metro solo para la trayectoria
      const sal = { x: x1 - nx * R + 2, y: y1 - ny * R };
      const vx = e.v * Math.cos(ang), vy = e.v * Math.sin(ang);
      const tCaida = 0.55;
      ctx.strokeStyle = "#b45309"; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sal.x, sal.y);
      for (let k = 1; k <= 20; k++) {
        const tt = tCaida * k / 20;
        ctx.lineTo(sal.x + vx * tt * escTiro, sal.y - (vy * tt - 0.5 * 9.81 * tt * tt) * escTiro);
      }
      ctx.stroke(); ctx.setLineDash([]);
      const nTiro = Math.round(5 + 9 * llen);
      ctx.fillStyle = colorMat;
      for (let i = 0; i < nTiro; i++) {
        const tt = ((t * 1.3 + i / nTiro) % 1) * tCaida;
        const dx = vx * tt * escTiro, dy = (vy * tt - 0.5 * 9.81 * tt * tt) * escTiro;
        ctx.beginPath(); ctx.arc(sal.x + dx + (aleat(i) - 0.5) * 4, sal.y - dy, 1.8 + aleat(i + 5) * 1.6, 0, 2 * Math.PI); ctx.fill();
      }
    }

    // ---------- textos ----------
    ctx.font = "12px Arial"; ctx.fillStyle = COL.suave; ctx.textAlign = "left";
    ctx.fillText(`${nCarga} estaciones de carga (a_o = ${fmt(e.ao, 2)} m) · ${nRet} de retorno (a_u = ${fmt(e.au, 2)} m)`, 10, 16);
    ctx.fillText(`L = ${fmt(e.L, 1)} m · v = ${fmt(e.v, 2)} m/s · tiempo de recorrido = ${fmt(e.L / e.v, 0)} s`, 10, 32);
    ctx.textAlign = "center";
    ctx.fillText("Cola", x0, y0 + R + 28);
    ctx.fillText("Cabeza motriz", Math.min(x1, w - 50), Math.min(y1 + R + 28, y0 + R + 28));
    // flecha de sentido de avance
    const pm = P(largo * 0.5);
    const fx = pm.x - nx * (R + 34), fy = pm.y - ny * (R + 34);
    flecha(ctx, fx - ux * 25, fy - uy * 25, fx + ux * 25, fy + uy * 25, "#0f6cbd");

    // ---------- franja de datos bajo el dibujo ----------
    const d = $("anim-datos");
    if (ok) d.innerHTML = `B = <b>${r.B} mm</b> · Q<sub>max</sub> = <b>${fmt(r.QmaxB, 0)} t/h</b> · llenado <b>${fmt(r.llenado * 100, 1)} %</b> · motor <b>${r.motor ? fmt(r.motor, r.motor < 1 ? 2 : 1) + " kW" : "—"}</b> · T₁ = <b>${fmt(r.T1 / 1000, 2)} kN</b>`;
    else d.textContent = "Sin solución con los datos actuales (ver mensaje de error).";
  }

  /* -------------------------------------------------------------------
     GRÁFICA PARAMÉTRICA: se repite el cálculo completo variando un dato
     (eje X) y se representa la magnitud elegida (eje Y). Punto rojo:
     situación actual. Como en el ejemplo de la ley de Hooke.
     ------------------------------------------------------------------- */
  const EJES_X = {
    Q:     { nombre: "Caudal Q (t/h)",            rango: e => [Math.max(1, e.Q * 0.1), e.Q * 2.5], dec: 0 },
    v:     { nombre: "Velocidad v (m/s)",         rango: () => [0.4, 6], dec: 1 },
    L:     { nombre: "Longitud L (m)",            rango: e => [5, Math.max(50, e.L * 3)], dec: 0 },
    delta: { nombre: "Inclinación δ (°)",         rango: () => [0, 20], dec: 0 },
    rho:   { nombre: "Peso específico q_s (t/m³)", rango: e => [Math.max(0.1, e.rho * 0.4), e.rho * 2], dec: 2 }
  };
  const EJES_Y = {
    PM:      { nombre: "Potencia motor P_M (kW)", f: r => r.PM / 1000, dec: 1 },
    T1:      { nombre: "Tensión máxima T₁ (kN)",  f: r => r.T1 / 1000, dec: 1 },
    Fu:      { nombre: "Fuerza tangencial F_U (kN)", f: r => r.Fu / 1000, dec: 1 },
    B:       { nombre: "Ancho de banda B (mm)",   f: r => r.B, dec: 0, escalon: true },
    llenado: { nombre: "Grado de llenado (%)",    f: r => r.llenado * 100, dec: 0 },
    n:       { nombre: "Número de telas",         f: r => r.n, dec: 0, escalon: true }
  };

  // Paso "redondo" (1, 2, 2,5 o 5 · 10^k) para las divisiones de los ejes
  function pasoRedondo(rango, divisiones) {
    const bruto = rango / divisiones;
    const pot = Math.pow(10, Math.floor(Math.log10(bruto)));
    const n = bruto / pot;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pot;
  }
  function decimalesDe(paso) { return paso >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(paso) - 1e-9)); }

  function dibujarParametrico(e) {
    const cv = $("canvas-param");
    const { ctx, w, h } = prepararCanvas(cv);
    const kx = $("graf-x").value, ky = $("graf-y").value;
    const X = EJES_X[kx], Yd = EJES_Y[ky];
    const [xa, xb] = X.rango(e);
    const N = 120;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const x = xa + (xb - xa) * i / N;
      const r = calcularCinta({ ...e, [kx]: x }, DATOS);
      pts.push(r.ok ? { x, y: Yd.f(r), B: r.B } : { x, y: null, B: null });
    }
    const rAct = calcularCinta(e, DATOS);
    const xAct = e[kx], yAct = rAct.ok ? Yd.f(rAct) : null;
    const validos = pts.filter(p => p.y !== null);
    const m = { izq: 70, der: 18, sup: 18, inf: 48 };
    const an = w - m.izq - m.der, al = h - m.sup - m.inf;
    if (!validos.length) {
      ctx.fillStyle = COL.mal; ctx.textAlign = "center"; ctx.fillText("Sin solución en este rango.", w / 2, h / 2); return;
    }
    let yMax = Math.max(...validos.map(p => p.y), yAct || 0);
    yMax = yMax <= 0 ? 1 : yMax * 1.08;
    const pasoY = pasoRedondo(yMax, 5);
    yMax = Math.ceil(yMax / pasoY) * pasoY;
    const pasoX = pasoRedondo(xb - xa, 6);
    const PX = x => m.izq + (x - xa) / (xb - xa) * an;
    const PY = y => m.sup + al - (y / yMax) * al;

    // rejilla y números (como en el ejemplo de Hooke)
    ctx.font = "12px Arial";
    ctx.strokeStyle = COL.rejilla; ctx.lineWidth = 1; ctx.fillStyle = COL.suave;
    for (let yv = 0; yv <= yMax + 1e-9; yv += pasoY) {
      ctx.beginPath(); ctx.moveTo(m.izq, PY(yv)); ctx.lineTo(w - m.der, PY(yv)); ctx.stroke();
      ctx.textAlign = "right"; ctx.fillText(fmt(yv, decimalesDe(pasoY)), m.izq - 8, PY(yv) + 4);
    }
    for (let xv = Math.ceil(xa / pasoX - 1e-9) * pasoX; xv <= xb + 1e-9; xv += pasoX) {
      ctx.beginPath(); ctx.moveTo(PX(xv), m.sup); ctx.lineTo(PX(xv), m.sup + al); ctx.stroke();
      ctx.textAlign = "center"; ctx.fillText(fmt(xv, decimalesDe(pasoX)), PX(xv), m.sup + al + 18);
    }
    ctx.fillStyle = "#334155"; ctx.font = "13px Arial"; ctx.textAlign = "center";
    ctx.fillText(X.nombre, m.izq + an / 2, h - 8);
    ctx.save(); ctx.translate(16, m.sup + al / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(Yd.nombre, 0, 0); ctx.restore();

    // cambios de ancho de banda (líneas verticales)
    ctx.font = "11px Arial";
    let ultimaEtiqueta = -Infinity;
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].B && pts[i - 1].B && pts[i].B !== pts[i - 1].B) {
        const xm = PX((pts[i].x + pts[i - 1].x) / 2);
        ctx.strokeStyle = "#94a3b8"; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(xm, m.sup); ctx.lineTo(xm, m.sup + al); ctx.stroke(); ctx.setLineDash([]);
        if (xm - ultimaEtiqueta > 52) {   // no superponer etiquetas
          ctx.fillStyle = COL.suave; ctx.textAlign = "left";
          ctx.fillText(`B = ${pts[i].B}`, xm + 3, m.sup + 11);
          ultimaEtiqueta = xm;
        }
      }
    }

    // curva
    ctx.strokeStyle = "#2563eb"; ctx.lineWidth = 3; ctx.lineJoin = "round";
    ctx.beginPath();
    let abierto = false;
    pts.forEach((p, i) => {
      if (p.y === null) { abierto = false; return; }
      if (!abierto) { ctx.moveTo(PX(p.x), PY(p.y)); abierto = true; }
      else if (Yd.escalon) { ctx.lineTo(PX(p.x), PY(pts[i - 1].y)); ctx.lineTo(PX(p.x), PY(p.y)); }
      else ctx.lineTo(PX(p.x), PY(p.y));
    });
    ctx.stroke();
    // zona sin solución
    if (pts.some(p => p.y === null)) {
      ctx.fillStyle = "#fee2e255";
      pts.forEach((p, i) => { if (p.y === null && i < pts.length - 1) ctx.fillRect(PX(p.x), m.sup, PX(pts[i + 1].x) - PX(p.x) + 1, al); });
      ctx.fillStyle = COL.mal; ctx.textAlign = "right"; ctx.font = "11px Arial";
      ctx.fillText("zona rosa: ningún ancho de la tabla es suficiente", w - m.der - 4, m.sup + al - 6);
    }

    // punto rojo: situación actual
    if (yAct !== null && xAct >= xa && xAct <= xb) {
      ctx.strokeStyle = "#dc262666"; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PX(xAct), PY(yAct)); ctx.lineTo(PX(xAct), m.sup + al);
      ctx.moveTo(PX(xAct), PY(yAct)); ctx.lineTo(m.izq, PY(yAct)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#dc2626";
      ctx.beginPath(); ctx.arc(PX(xAct), PY(yAct), 6.5, 0, 2 * Math.PI); ctx.fill();
      const txt = `${fmt(xAct, X.dec + 1)} → ${fmt(yAct, Yd.dec + 1)}`;
      ctx.font = "bold 12px Arial"; ctx.textAlign = PX(xAct) > w - 150 ? "right" : "left";
      const off = ctx.textAlign === "right" ? -10 : 10;
      ctx.lineWidth = 4; ctx.strokeStyle = "#fff"; ctx.strokeText(txt, PX(xAct) + off, PY(yAct) - 10);
      ctx.fillText(txt, PX(xAct) + off, PY(yAct) - 10);
    }
  }

  /* -------------------------------------------------------------------
     EVENTOS
     ------------------------------------------------------------------- */
  function enlazar(idNum, idRango) {
    $(idNum).addEventListener("input", () => { $(idRango).value = $(idNum).value; recalcular(); });
    $(idRango).addEventListener("input", () => { $(idNum).value = $(idRango).value; recalcular(); });
  }

  function enlazarEventos() {
    $("buscar-material").addEventListener("input", ev => { rellenarMateriales(ev.target.value); alSeleccionarMaterial(); proponerRecubrimientos(); recalcular(); });
    $("material").addEventListener("change", () => { alSeleccionarMaterial(); proponerRecubrimientos(); recalcular(); });
    ["alfa-pers", "abras-pers", "corros-pers", "nombre-pers"].forEach(id => $(id).addEventListener("input", () => {
      if (id === "alfa-pers") { const c = clasificarFluidez($("alfa-pers").value === "" ? null : Number($("alfa-pers").value), DATOS.parametros); if (c) $("beta").value = c.betaRecomendado; }
      if (id === "abras-pers") proponerRecubrimientos();
      recalcular();
    }));
    enlazar("rho", "rho-rango");
    enlazar("Q", "Q-rango");
    enlazar("v", "v-rango");
    enlazar("L", "L-rango");
    enlazar("delta", "delta-rango");
    document.querySelectorAll('input[name="tipo"]').forEach(rb => rb.addEventListener("change", () => { actualizarLambdas(); recalcular(); }));
    ["beta", "lambda", "anchoFijo", "K1", "aMax", "ao", "au", "diamRodillo", "mRO", "mRU", "f", "Cmanual",
      "mu", "theta", "eta", "tejido", "FS", "eSup", "eInf", "calidadRec", "Dtambor"]
      .forEach(id => $(id).addEventListener("input", recalcular));
    $("btn-ejemplo").addEventListener("click", cargarEjemplo);
    ["graf-x", "graf-y"].forEach(id => $(id).addEventListener("change", () => { if (ultimo && ultimo.ok) dibujarParametrico(ultimo.entrada); }));
    $("btn-pausa").addEventListener("click", () => {
      ANIM.pausa = !ANIM.pausa;
      $("btn-pausa").textContent = ANIM.pausa ? "▶ Reanudar" : "❚❚ Pausa";
      $("btn-pausa").setAttribute("aria-pressed", String(ANIM.pausa));
    });
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      ANIM.pausa = true; $("btn-pausa").textContent = "▶ Reanudar";
    }
    requestAnimationFrame(bucleAnimacion);
    $("btn-imprimir").addEventListener("click", () => window.print());
    let t; window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(recalcular, 120); });
  }

  // Ejemplo resuelto en el Readme.txt
  function cargarEjemplo() {
    $("buscar-material").value = "";
    rellenarMateriales();
    $("material").value = "caliza-fragmentada";
    alSeleccionarMaterial();
    proponerRecubrimientos();
    const val = { Q: 500, v: 2, L: 120, delta: 8, rho: 1.36 };
    for (const [k, x] of Object.entries(val)) { $(k).value = x; $(k + "-rango").value = x; }
    $("beta").value = 20;
    document.querySelector('input[name="tipo"][value="tres"]').checked = true;
    actualizarLambdas();
    $("lambda").value = "30";
    $("anchoFijo").value = "0";
    $("K1").value = "1";
    $("aMax").value = 100;
    $("ao").value = 1.2; $("au").value = 3;
    $("diamRodillo").value = "133";
    $("mRO").value = ""; $("mRU").value = "";
    $("f").value = "0.02"; $("Cmanual").value = "";
    $("mu").value = "0.35"; $("theta").value = "210"; $("eta").value = 0.9;
    $("tejido").value = "L"; $("FS").value = 10;
    $("Dtambor").value = "500";
    recalcular();
  }

  iniciar();
}
