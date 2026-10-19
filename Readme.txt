=====================================================================
  DIMENSIONADO DE CINTAS TRANSPORTADORAS - APLICACIÓN WEB
  Transporte y Manutención Industrial · Máster en Ingeniería Industrial
  Universidad de Salamanca
=====================================================================

1. OBJETIVO
-----------
Aplicación web interactiva para dimensionar una cinta transportadora de
material a granel. A partir del material, el caudal, la velocidad, la
longitud, la inclinación y el tipo de estación de rodillos, calcula:

  - El ancho de banda necesario (tablas de capacidad volumétrica).
  - La capacidad máxima y el grado de llenado de la sección.
  - Las resistencias al movimiento y la fuerza tangencial en el tambor.
  - La potencia en el tambor y la del motor (con motor normalizado).
  - El par y la velocidad de giro del tambor motriz.
  - Las tensiones de la banda (Euler-Eytelwein y flecha entre rodillos).
  - El número de telas de la banda y su designación según UNE 18025.
  - Una serie de comprobaciones y recomendaciones de los apuntes.

Todo se recalcula al instante al mover cualquier control, y la página
muestra la memoria de cálculo completa paso a paso (fórmula, sustitución
numérica y resultado), para poder comprobar cada número a mano.


2. ARCHIVOS
-----------
  index.html         Estructura de la página: formularios, tarjetas de
                     resultados y los tres elementos <canvas>.
  styles.css         Aspecto visual (colores, rejilla en dos columnas,
                     adaptación a móvil y formato de impresión a PDF).
  script.js          Programa en JavaScript. Tiene tres partes:
                       a) calcularCinta(): MOTOR DE CÁLCULO. Es una función
                          pura que recibe los datos y las tablas y devuelve
                          los resultados. No depende de la página, por lo
                          que se puede comprobar por separado (Node.js).
                       b) Interfaz: lee los controles, muestra resultados,
                          avisos y memoria de cálculo.
                       c) Dibujos en <canvas>: animación de la cinta,
                          gráfica paramétrica, sección transversal,
                          capacidades y tensiones.
  materiales.json    Tab. 2 de Rulmeca: 125 materiales con su peso
                     específico aparente (mín-máx), ángulo de reposo,
                     abrasividad y corrosividad.
  capacidades.json   Tablas 5a, 5b, 5c y 5d de Rulmeca: capacidad
                     volumétrica IVT (m3/h) a v = 1 m/s según ancho de
                     banda, ángulo de artesa λ y ángulo de sobrecarga β.
  parametros.json    Coeficientes auxiliares: tabla de fluidez de los
                     apuntes, factor K de inclinación, factor K1 de
                     alimentación, coeficiente C (DIN 22101), coeficiente
                     f, rozamiento banda-tambor μ, ángulos de abrazamiento,
                     calidades de tejido y recubrimiento (UNE 18025),
                     diámetros de rodillos y tambores, motores normalizados.
  Readme.txt         Este archivo.

Los datos están en JSON para que puedan ampliarse o corregirse sin tocar
el código: por ejemplo, añadir un material nuevo a materiales.json hace
que aparezca automáticamente en la lista desplegable.


3. CÓMO EJECUTARLO
------------------
Los archivos JSON se leen con fetch(), por lo que la página debe abrirse
desde un servidor (si se abre el index.html con doble clic, el navegador
bloquea la lectura de los JSON).

Opción A - En local (requiere Python instalado):
  1. Descomprime el ZIP en una carpeta.
  2. Abre una consola (PowerShell) en esa carpeta.
  3. Ejecuta:
        Windows:      py -m http.server 8000   (o python -m http.server 8000)
        macOS/Linux:  python3 -m http.server 8000
  4. Abre en el navegador:  http://localhost:8000
  5. Para detener el servidor: Ctrl+C en la consola.

Opción B - En GitHub Pages (sin instalar nada):
  1. Sube todos los archivos a la raíz de un repositorio público de GitHub.
  2. En el repositorio: Settings > Pages > Source: "Deploy from a branch",
     rama "main", carpeta "/ (root)" > Save.
  3. Al cabo de un minuto la aplicación estará disponible en
        https://<usuario>.github.io/<repositorio>/


4. CÓMO SE USA
--------------
La columna izquierda contiene los datos, en cuatro bloques. La columna
derecha muestra los resultados, que se actualizan al instante.

  1. MATERIAL. Se puede buscar escribiendo parte del nombre. Al elegirlo
     se muestran su ángulo de reposo α, su clase de fluidez, el ángulo de
     sobrecarga β recomendado y sus grados de abrasividad y corrosividad.
     El peso específico se puede ajustar dentro del rango de la tabla (por
     defecto se toma el MÍNIMO, que es el caso más desfavorable para el
     ancho porque da más volumen). Con «Material personalizado» se pueden
     introducir propiedades propias.
  2. CONDICIONES DE TRANSPORTE. Caudal Q (t/h), velocidad v (m/s, con
     botones de velocidades normalizadas), longitud entre ejes L (m),
     inclinación δ (0 a 20°), regularidad de la alimentación y, opcional,
     tamaño máximo de terrón.
  3. TIPO DE CINTA. Estación plana, de 2 rodillos (en V), de 3 rodillos
     (artesa) o de 5 rodillos (guirnalda); ángulo de artesa λ; ancho
     automático o impuesto; paso de rodillos en carga y retorno; diámetro
     de rodillos y, si se conoce, la masa giratoria real del catálogo.
  4. BANDA Y ACCIONAMIENTO. Calidad de tejido (L, LS, P), coeficiente de
     seguridad, calidad y espesores de los recubrimientos, superficie del
     tambor (μ), ángulo de abrazamiento θ, diámetro de tambor, rendimiento
     η, coeficiente de rozamiento f y, opcional, el coeficiente C.

Resultados (todos cambian al instante al modificar cualquier dato):

  - LA CINTA EN FUNCIONAMIENTO (animación en vista lateral, <canvas>).
    Se mantiene visible mientras se modifican los datos. Representa:
      · la inclinación real δ y la altura H;
      · las estaciones de carga y de retorno con su paso real a_o y a_u
        (se indica cuántas hay);
      · la banda y los tambores moviéndose a una velocidad proporcional
        a v, con el motor-reductor en cabeza;
      · la tolva y el material sobre la banda: la cantidad y altura de
        la carga es proporcional al grado de llenado;
      · la descarga en cabeza como tiro parabólico con velocidad v y
        ángulo δ (x = v·cos δ·t ; y = v·sen δ·t − g·t²/2), tal como se
        describe en los apuntes.
    Botón «Pausa / Reanudar» para detenerla durante la exposición.

  - GRÁFICA INTERACTIVA (como la del ejemplo de la ley de Hooke). Se
    elige una magnitud (potencia del motor, T1, F_U, ancho de banda,
    grado de llenado o nº de telas) y el parámetro del que depende
    (caudal, velocidad, longitud, inclinación o peso específico). La
    aplicación repite el cálculo completo para 121 valores del parámetro
    manteniendo el resto de datos, dibuja la curva en azul y marca en
    rojo el punto actual. Las líneas grises discontinuas indican dónde
    cambia el ancho de banda. Ejemplos útiles:
      · Potencia frente a caudal: crece casi linealmente, con pequeños
        saltos cuando cambia el ancho (más peso de banda y rodillos).
      · Ancho de banda frente a velocidad: escalones descendentes; a más
        velocidad, menos sección y por tanto banda más estrecha.

  - Indicadores principales, designación de la banda, dibujo a escala
    de la sección cargada, gráfico de barras de la capacidad de cada
    ancho frente al caudal pedido, esquema de tensiones, avisos, resumen
    numérico y memoria de cálculo. El botón «Imprimir / guardar PDF» genera un informe.
El botón «Cargar ejemplo del Readme» carga los datos del apartado 6.


5. MÉTODO DE CÁLCULO
--------------------
Unidades: Q en t/h, v en m/s, longitudes en m, masas lineales en kg/m,
fuerzas en N, g = 9,81 m/s2.

5.1 Ángulo de sobrecarga (tabla de fluidez de los apuntes)
    α ≤ 20°          fluidez muy buena  -> β = 5°
    20° < α ≤ 30°    fluidez buena      -> β = 10°
    30° < α ≤ 40°    fluidez normal     -> β = 20°-25° (se propone 20°,
                                           que es el lado de la seguridad)
    α > 40°          fluidez mala       -> β = 30°
    Si la tabla no da α, se propone β = 20° y el usuario lo elige.

5.2 Capacidad y ancho de banda (Rulmeca)
    Caudal volumétrico:                  I_M   = Q / qs              [m3/h]
    Factor de inclinación (Tab. 6):      K     = f(δ), interpolado
    Factor de alimentación:              K1    = 1; 0,95; 0,90; 0,80
    Caudal equivalente horizontal:       I_VM  = I_M / (K · K1)      [m3/h]
    Capacidad necesaria a 1 m/s:         I_VT,nec = I_VM / v         [m3/h]
    Se elige en la tabla (5a, 5b, 5c o 5d según la estación, con λ y β)
    el MENOR ancho B tal que  I_VT(B) ≥ I_VT,nec.
    Capacidad máxima:     Q_max = I_VT(B) · v · K · K1 · qs          [t/h]
    Grado de llenado:     I_VT,nec / I_VT(B)

5.3 Cargas por metro
    Altura:                  H    = L · sen δ
    Material:                q_G  = Q / (3,6 · v)                    [kg/m]
    Rodillos de carga:       q_RO = m_RO / a_o
    Rodillos de retorno:     q_RU = m_RU / a_u
      (si no se introduce m, se estima: m = masa por metro de rodillo
       según su diámetro · 1,15 · B)
    Banda:                   q_B  = B · (n · m_tela + (e_sup + e_inf) · 1,15)
      (n = nº de telas, m_tela = 1,0 / 1,1 / 1,2 kg/m2 para L / LS / P,
       espesores en mm, goma 1,15 kg/m2 por mm)

5.4 Resistencias y potencia (método DIN 22101)
    Ramal de carga:   F_carga = C·f·L·g·[q_RO + (q_B + q_G)·cos δ] + (q_B + q_G)·H·g
    Ramal de retorno: F_ret   = C·f·L·g·[q_RU + q_B·cos δ] − q_B·H·g
    Fuerza tangencial:
       F_U = F_carga + F_ret = C·f·L·g·[q_RO + q_RU + (2·q_B + q_G)·cos δ] + q_G·H·g
    C = coeficiente de resistencias secundarias (tabla DIN 22101 en
        función de L, interpolada).
    Potencia en el tambor:  P_A = F_U · v
    Potencia del motor:     P_M = P_A / η  -> motor normalizado superior.
    Par y giro del tambor:  M = F_U · D/2 ;  n = 60·v / (π·D) ;  P = M·ω

5.5 Tensiones (Euler-Eytelwein y flecha)
    Accionamiento en cabeza. Puntos: T1 (llega al tambor motriz por el
    ramal cargado), T2 (sale del motriz por el retorno), T3 = T4 (tambor
    de cola).
    a) Para que la banda no deslice:   T1/T2 ≤ e^(μθ)  ->  T2 ≥ F_U / (e^(μθ) − 1)
    b) Flecha máxima en carga (h/a = 2 %):
          T0 = (q_B + q_G)·g·a_o / (8·0,02)  y en la cola  T3 = T2 + F_ret ≥ T0
    c) Flecha máxima en retorno:
          T_r = q_B·g·a_u / (8·0,02)  y se exige  T2 ≥ T_r  y  T3 ≥ T_r
    Se adopta T2 = máximo de las condiciones a), b) y c); entonces
          T1 = T2 + F_U      T3 = T4 = T2 + F_ret
    y se comprueba de nuevo T1/T2 ≤ e^(μθ).

5.6 Banda (UNE 18025)
    Nº de telas:   n ≥ T1 · CS / (B[cm] · R_tela · g)
       R_tela = 60 / 70 / 75 kgf/cm por tela para tejido L / LS / P.
    Como el peso de la banda depende de n, y T1 depende del peso, el
    cálculo se repite (iteración) hasta que n no cambia.
    Desarrollo de la banda:  L_des = 2·L + π·D (tambores de igual diámetro).
    Designación:  B  Calidad_recubrimiento – n Tejido / e_sup - e_inf  des L_des
       (espesores en décimas de mm), igual que el ejemplo de los apuntes
       "500 A – 4L/35-15 des50 UNE 18025".

5.7 Comprobaciones automáticas (apuntes y criterios orientativos)
    - Capacidad suficiente y grado de llenado.
    - Adherencia en el tambor (T1/T2 ≤ e^(μθ)).
    - Más de 5°: zona de carga horizontal bajo la tolva.
    - Más de 18°: banda lisa al límite; valorar banda con perfiles.
    - Peso específico > 2 t/m3: rodillos de impacto en la zona de carga.
    - Paso de rodillos de carga 1-1,5 m; retorno 2-3 veces el de carga.
    - Diámetro de rodillos aconsejable 100-150 mm.
    - Material muy abrasivo: recubrimiento calidad A; velocidad limitada.
    - Tamaño de terrón ≤ B/3 (orientativo).
    - Más de 6 telas: pasar a banda de cables de acero (St).
    - Uso de un valor de tabla sospechoso de errata (ver apartado 7).


6. EJEMPLO RESUELTO
-------------------
Enunciado: transportar 500 t/h de caliza fragmentada a una distancia de
120 m con una pendiente ascendente de 8°, con estaciones de 3 rodillos
en artesa a 30° y velocidad de 2 m/s.

Datos adoptados (son los que carga el botón «Cargar ejemplo»):
  Material: Caliza fragmentada (Tab. 2): qs = 1,36-1,44 t/m3, α = 35°,
            abrasividad B, corrosividad A.
            Se toma qs = 1,36 t/m3 (mínimo: más volumen).
            α = 35° -> fluidez normal -> β = 20°.
  Q = 500 t/h ; v = 2 m/s ; L = 120 m ; δ = 8° ; alimentación regular.
  Estación de 3 rodillos, λ = 30°. Rodillos Ø133 mm.
  a_o = 1,2 m ; a_u = 3,0 m ; f = 0,020.
  Tambor revestido de goma seco μ = 0,35 ; θ = 210° ; D = 500 mm ;
  η = 0,90. Tejido L, CS = 10, recubrimiento B de 4 + 2 mm.

PASO 1 - Ancho de banda
  I_M      = 500 / 1,36                       = 367,65 m3/h
  K (8°)   = 0,97  (Tab. 6)        K1 = 1
  I_VM     = 367,65 / (0,97 · 1)              = 379,02 m3/h
  I_VT,nec = 379,02 / 2                       = 189,51 m3/h
  Tab. 5c, λ = 30°, β = 20°:
     B = 650 mm -> 176,4 m3/h  < 189,51  NO CUMPLE
     B = 800 mm -> 278,2 m3/h  ≥ 189,51  CUMPLE
  => B = 800 mm
  Q_max = 278,2 · 2 · 0,97 · 1 · 1,36         = 734,0 t/h
  Grado de llenado = 189,51 / 278,2           = 68,1 %

PASO 2 - Cargas por metro
  H    = 120 · sen 8°                         = 16,70 m
  q_G  = 500 / (3,6 · 2)                      = 69,44 kg/m
  m_RO = m_RU = 16,0 kg/m · 1,15 · 0,8 m      = 14,72 kg por estación
  q_RO = 14,72 / 1,2                          = 12,27 kg/m
  q_RU = 14,72 / 3,0                          = 4,91 kg/m
  C (L = 120 m, DIN 22101)                    = 1,70
  q_B con 5 telas L (resultado final de la iteración):
  q_B  = 0,8 · (5 · 1,0 + (4 + 2) · 1,15)     = 9,52 kg/m

PASO 3 - Resistencias y potencia   (cos 8° = 0,9903)
  F_carga = 1,70·0,020·120·9,81·[12,27 + (9,52 + 69,44)·0,9903]
            + (9,52 + 69,44)·16,70·9,81       = 16 558 N
  F_ret   = 1,70·0,020·120·9,81·[4,91 + 9,52·0,9903]
            − 9,52·16,70·9,81                 = −986 N
            (negativo: en el retorno la banda baja y "ayuda")
  F_U     = 16 558 − 986                      = 15 572 N
  P_A     = 15 572 · 2                        = 31,14 kW
  P_M     = 31,14 / 0,90                      = 34,60 kW  -> MOTOR DE 37 kW
  Par en el tambor:  M = 15 572 · 0,25        = 3 893 N·m
  Giro del tambor:   n = 60·2 / (π·0,5)       = 76,4 rpm  (i ≈ 19 con motor de 1450 rpm)

PASO 4 - Tensiones
  e^(μθ) = e^(0,35 · 210·π/180) = e^(1,2828)  = 3,607
  a) Adherencia:     T2 ≥ 15 572 / (3,607 − 1) = 5 974 N
  b) Flecha carga:   T0 = (9,52 + 69,44)·9,81·1,2 / 0,16 = 5 810 N
                     T3 = T2 + F_ret ≥ 5 810  -> T2 ≥ 5 810 + 986 = 6 796 N
  c) Flecha retorno: T_r = 9,52·9,81·3 / 0,16  = 1 751 N
  => T2 = 6 796 N  (gobierna la flecha del ramal de carga en la cola)
  T1 = 6 796 + 15 572                         = 22 368 N
  T3 = T4 = 6 796 − 986                       = 5 810 N
  Comprobación: T1/T2 = 22 368 / 6 796 = 3,291 ≤ 3,607  -> NO DESLIZA

PASO 5 - Banda
  Tensión unitaria: 22 368 N / 800 mm         = 27,96 N/mm
  n ≥ 22 368 · 10 / (80 cm · 60 kgf/cm · 9,81) = 4,75  -> n = 5 telas L
  (iteración: con 2 telas q_B = 7,12 kg/m daba n ≥ 4,61 -> 5 telas;
   con 5 telas q_B = 9,52 kg/m da n ≥ 4,75 -> 5 telas: converge)
  CS real = 5 · 80 · 588,6 / 22 368           = 10,53
  L_des = 2·120 + π·0,5                       = 241,57 m -> 242 m
  DESIGNACIÓN:  800 B – 5L/40-20 des242 UNE 18025

RESUMEN: banda de 800 mm en artesa de 3 rodillos a 30°, 2 m/s, capacidad
máxima 734 t/h (llenado 68 %), motor de 37 kW, T1 = 22,4 kN, banda de 5
telas L con recubrimientos de 4 y 2 mm.


7. OBSERVACIONES SOBRE LAS TABLAS DE CAPACIDAD
----------------------------------------------
Al pasar las tablas de Rulmeca a JSON se comprobó automáticamente que la
capacidad crece con β, con λ y con el ancho. Hay cinco valores impresos
en el catálogo que no cumplen esa tendencia (se ha verificado sobre el
PDF original que están así impresos):

  Tab. 5a  B = 800,  β = 30°            198,3   (esperable ≈ 234)
  Tab. 5b  B = 800,  β = 5°             175,6   (esperable ≈ 161)
  Tab. 5b  B = 1000, β = 5°             317,1   (mayor que con β = 10°: 310,6)
  Tab. 5c  B = 400,  β = 10°, λ = 25°    29,2   (probable errata de 39,2)
  Tab. 5c  B = 2800, β = 30°, λ = 30°  5185,6   (mayor que con λ = 35°: 4888,7)

La aplicación usa los valores tal como están impresos (son los datos de
la asignatura), pero, si el cálculo utiliza uno de ellos, lo marca en el
gráfico con ⚠ y muestra un aviso explicando el problema.


8. HIPÓTESIS Y LIMITACIONES
---------------------------
  - Cinta horizontal o ascendente (0° a 20°, rango del factor K) con un
    solo tambor motriz en cabeza. No se tratan cintas descendentes con
    frenado ni accionamientos intermedios.
  - Resistencias por el método del coeficiente C de DIN 22101 (incluye de
    forma global las resistencias secundarias: zona de carga, rascadores,
    tambores...). Se puede imponer un C propio.
  - Masas de rodillos y de telas: valores orientativos editables en
    parametros.json o desde la propia página (masa por estación).
  - Velocidades máximas por abrasividad: criterio orientativo.
  - El desarrollo de banda no incluye empalme ni recorrido del tensor
    (conviene prever ≈ 1 % de alargamiento, según los apuntes).
  - Herramienta de predimensionado con fines docentes: el diseño final
    debe contrastarse con el catálogo del fabricante.


9. FUENTES
----------
  - Apuntes de la asignatura "Transporte y Manutención Industrial"
    (Cintas transportadoras I y II), Universidad de Salamanca.
  - Rulmeca: "Informaciones técnicas y criterios de diseño de las cintas
    transportadoras": Tab. 2 (propiedades de materiales), Tab. 5a-5d
    (capacidades volumétricas), Tab. 6 (factor K).
  - DIN 22101: Continuous conveyors. Belt conveyors for loose bulk
    materials. Basis for calculation and dimensioning.
  - UNE 18025: Bandas transportadoras compuestas de goma y tejido.
