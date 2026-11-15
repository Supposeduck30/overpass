# References

Every dataset, library, font and text Overpass uses. Versions are the ones in the repository on
14 November 2026.

## Data

| What | Where it is used | Source | Terms |
|---|---|---|---|
| NASA FIRMS active fire detections: MODIS Collection 6.1 (Terra, Aqua), VIIRS 375 m (S-NPP, NOAA-20, NOAA-21), standard-quality and near-real-time | The whole record, every figure and download | https://www.earthdata.nasa.gov/data/tools/firms | NASA open data policy, no restrictions on use |
| FIRMS country yearly archives | History to the last archived year | https://firms.modaps.eosdis.nasa.gov/country/ | As above |
| FIRMS Area API | Months after the archives; live month-to-date; recent detections for any box | https://firms.modaps.eosdis.nasa.gov/api/area/ | As above; needs a free map key |
| Natural Earth 1:50m land, country boundary lines, admin-1 lines | Map outlines | https://www.naturalearthdata.com/ | Public domain |
| Natural Earth 1:50m admin-0 countries | Clipping each region's box to its country (pipeline only) | https://www.naturalearthdata.com/ | Public domain |

FIRMS acknowledgment, as FIRMS asks: "We acknowledge the use of data and imagery from LANCE FIRMS
operated by NASA's Earth Science Data and Information System (ESDIS) with funding provided by NASA
Headquarters."

## Background on the satellites and products

- Challenge statement: https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/
- FIRMS on the S-NPP transition: https://www.earthdata.nasa.gov/news/blog/transitioning-from-suomi-npp-viirs-omps-what-firms-users-need-know
- S-NPP observations cease, 2 November 2026: https://www.earthdata.nasa.gov/data/alerts-outages/suomi-npp-observations-cease-november-2-2026
- MODIS to VIIRS transition: https://ladsweb.modaps.eosdis.nasa.gov/learn/modis-to-viirs-transition/
- NOAA-20 VIIRS 375 m NRT product: https://www.earthdata.nasa.gov/data/catalog/lancemodis-vj114imgtdl-nrt-2
- Aqua orbit drift: https://www.earthdata.nasa.gov/learn/articles/aqua-at-20
- Schroeder, W., Oliva, P., Giglio, L., Csiszar, I. A. (2014). The New VIIRS 375 m active fire detection data product: Algorithm description and initial assessment. Remote Sensing of Environment 143, 85–96.
- Li, F., Zhang, X., Kondragunta, S., Csiszar, I. (2018). Comparison of fire radiative power estimates from VIIRS and MODIS observations. Journal of Geophysical Research: Atmospheres 123, 4545–4563. https://repository.library.noaa.gov/view/noaa/49896
- Giglio, L., Schroeder, W., Justice, C. O. (2016). The collection 6 MODIS active fire detection algorithm and fire products. Remote Sensing of Environment 178, 31–41.

## Methods

- Pettitt, A. N. (1979). A non-parametric approach to the change-point problem. Journal of the Royal Statistical Society C 28(2), 126–135.
- Sen, P. K. (1968). Estimates of the regression coefficient based on Kendall's tau. Journal of the American Statistical Association 63, 1379–1389.
- Mann, H. B. (1945). Nonparametric tests against trend. Econometrica 13, 245–259. Kendall, M. G. (1975). Rank Correlation Methods. Griffin.
- Lei, J., G'Sell, M., Rinaldo, A., Tibshirani, R. J., Wasserman, L. (2018). Distribution-free predictive inference for regression. Journal of the American Statistical Association 113, 1094–1111. (Split-conformal interval widening.)
- Nuñez, J. R., Anderton, C. R., Renslow, R. S. (2018). Optimizing colormaps with consideration for color vision deficiency to enable accurate interpretation of scientific data. PLOS ONE 13(7), e0199239. (The cividis ramp.)
- Local solar time from longitude: solar time = UTC + longitude / 15 hours.

## Software

Web app (`web/package.json`):

| Library | Version | License |
|---|---|---|
| React, React DOM | 19.3.1 | MIT |
| three.js | 0.187.0 | MIT |
| deck.gl (core, layers, mapbox) | 9.4.1 | MIT |
| MapLibre GL JS | 6.18.0 | BSD-3-Clause |
| d3-array, d3-color, d3-interpolate, d3-scale, d3-scale-chromatic, d3-shape | 3.2.5, 3.1.1, 3.0.2, 4.0.3, 3.1.1, 3.2.1 | ISC |
| Vite, Vitest, TypeScript, @vitejs/plugin-react | 8.3.8, 5.1.0, 7.0.2, 6.3.0 | MIT, MIT, Apache-2.0, MIT |

Pipeline (`pipeline/requirements.txt`), Python 3.11: NumPy 2.4.6 (BSD-3-Clause), pandas 3.1.1
(BSD-3-Clause), PyArrow 26.0.1 (Apache-2.0), PyYAML 6.0.3 (MIT), Requests 2.34.2 (Apache-2.0),
pytest 9.2.0 (MIT).

## Fonts

- Atkinson Hyperlegible Next, Braille Institute of America, via @fontsource 5.3.0. SIL Open Font License 1.1. https://www.brailleinstitute.org/freefont/

## Images

Overpass uses no photographs, logos or generated images. Every figure is drawn by the app from
the data above.
