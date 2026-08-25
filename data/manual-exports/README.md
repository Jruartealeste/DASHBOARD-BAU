# Exports manuales

Este dashboard no puede traer todo por API — algunos reportes solo existen en
la interfaz de Google Ads / Meta Ads Manager. Este directorio recibe esos
exports en `.csv`; los scripts `scripts/parse-google-ads-manual.js` y
`scripts/parse-meta-ads-manual.js` los convierten a `data/raw/*.json` para
que `build-dataset.js` los use como cualquier otra fuente.

Es una foto manual, no un feed en vivo: cuando los números queden viejos,
volvé a exportar los mismos reportes (pisando los archivos anteriores) y
corré `npm run parse-google-ads-manual` / `npm run parse-meta-ads-manual`
seguido de `npm run build`.

## Google Ads (ads.google.com)

Desde la campaña o cuenta → pestaña del reporte correspondiente → ícono de
descarga → CSV. Dejá el nombre de archivo tal cual lo sugiere Google Ads
(el parser busca por texto parcial del nombre, no necesita ser exacto):

| Reporte a exportar | Nombre de archivo esperado (contiene) |
|---|---|
| Palabras clave (con tipo de concordancia) | `Palabras_clave` |
| Términos de búsqueda reales (agregado por cuenta) | `Búsquedas(Buscar` |
| Dispositivos | `Informe de dispositivos` |
| Páginas de destino | `Informe de páginas de destino` |
| Ubicaciones (geográfico) | `Informe de ubicaciones` (podés exportar más de uno, se combinan) |

## Meta Ads (Ads Manager, business.facebook.com/adsmanager)

Seleccioná el nivel indicado, agregá las columnas pedidas con "Personalizar
columnas", aplicá el desglose ("Desglose") si corresponde, y exportá con
Exportar → Exportar datos de la tabla → .csv. Un archivo por fila de esta
tabla:

| Qué cubre | Nivel | Desglose | Columnas clave a agregar | Nombre sugerido al exportar |
|---|---|---|---|---|
| Objetivo y presupuesto | Campañas | Ninguno | Objetivo, Presupuesto, Tipo de presupuesto, Importe gastado, Alcance, Frecuencia, Resultados, Costo por resultado | `campanas` |
| Públicos alcanzados | Campañas o Conjuntos de anuncios | Por entrega → Edad, Sexo | Alcance, Impresiones | `edad_sexo` |
| Plataformas y ubicaciones | Campañas o Conjuntos de anuncios | Por entrega → Plataforma y ubicación | Alcance, Impresiones, Importe gastado | `plataformas` |
| Destino de cada anuncio | Anuncios | Ninguno | Destino (o URL de página de destino) | `destino_anuncios` |
| Reproducciones y tiempo de visualización | Anuncios | Ninguno | Reproducciones de video, ThruPlays, Tiempo promedio de reproducción | `video` |

Los nombres de columna exactos varían según el idioma/versión de Ads
Manager — el parser se ajusta una vez que vemos el archivo real (igual que
pasó con los de Google Ads).
