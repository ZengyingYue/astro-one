# Aerospace

English | [中文](aerospace.zh.md)

The shared conventions and algorithm sources of the [aerospace package family](../../packages/aerospace/README.md). [`@astro-one/astrodynamics`](../../packages/aerospace/astrodynamics/README.md) implements the orbit and attitude algorithms; the tool packages add model-facing arguments, bounds, and result rendering. The family owns no `ctx` service, event, or Session data.

## Units and time

Model-facing tools use km, km/s, and degrees, and accept ISO 8601 instants with `Z` or a UTC offset. The library uses km, km/s, radians, and UTC milliseconds since the Unix epoch. TAI−UTC follows the compiled IERS leap-second table; TT is TAI + 32.184 s; GPS time is TAI − 19 s. Sidereal time follows IAU-1982 GMST with the equation of the equinoxes; UT1 − UTC is zero unless the caller supplies `dut1`.

## Reference frames

| Frame | Meaning |
|---|---|
| GCRF | Inertial J2000 mean equator and equinox; the default output frame |
| TEME | True equator, mean equinox of date; the SGP4 output frame |
| ITRF | Earth-fixed frame; IAU-1976 precession, leading IAU-1980 nutation terms, apparent sidereal time, and optional IERS polar motion (`xp`, `yp`) |
| Geodetic | WGS-84 latitude, longitude, and ellipsoidal height |
| RTN | Radial, transverse, normal frame of a state, used for covariances and miss vectors |

## Algorithms

| Capability | Method | Source |
|---|---|---|
| Catalog propagation | SGP4/SDP4 through satellite.js | Vallado, Crawford, Hujsak, Kelso, *Revisiting Spacetrack Report #3*, AIAA 2006-6753 |
| Numerical propagation | RKF7(8) with J2–J6 zonals, exponential drag, cannonball SRP with conical shadow, Sun/Moon gravity | Fehlberg, NASA TR R-287 (1968); Montenbruck and Gill, *Satellite Orbits* (2000) |
| Kepler propagation | Universal variables with Laguerre–Conway iteration | Vallado, *Fundamentals of Astrodynamics and Applications*, 4th ed. |
| Lambert | Izzo solver with multi-revolution branches | Izzo, *Revisiting Lambert's problem*, CMDA 121 (2015) |
| Initial orbit determination | Gibbs, Herrick–Gibbs, Gauss angles-only with iterative refinement | Vallado (2013); Curtis, *Orbital Mechanics for Engineering Students* |
| Precise orbit determination | Levenberg–Marquardt batch least squares with sigma editing; unscented Kalman filter | Tapley, Schutz, Born, *Statistical Orbit Determination* (2004); Wan and van der Merwe (2000) |
| Collision probability | Foster 2D short-encounter integral; Alfano maximum probability | Foster and Estes, NASA JSC-25898 (1992); Alfano, *Relating position uncertainty to maximum conjunction probability* (2005) |
| Attitude determination | TRIAD, Davenport q-method, QUEST with error covariance | Shuster and Oh, JGC 4(1) (1981); Markley and Crassidis, *Fundamentals of Spacecraft Attitude Determination and Control* (2014) |
| GNSS broadcast orbits | GPS, Galileo, BeiDou MEO/IGSO/GEO ephemeris and clock | IS-GPS-200, Galileo OS SIS ICD, BDS-SIS-ICD-B1I |
| GNSS positioning | Klobuchar ionosphere, Saastamoinen troposphere, weighted least squares, RAIM fault exclusion | RTKLIB (Takasu) algorithms; Kaplan and Hegarty, *Understanding GPS/GNSS* |
| RTK | Double-difference extended Kalman filter, MLAMBDA integer search, ratio test | Teunissen (1995); Chang, Yang, Zhou, *MLAMBDA*, J. Geodesy 79 (2005) |
| Spectral indices | NDVI, NDWI, MNDWI, NDBI, NBR, NDRE, NDSI, EVI, SAVI | Rouse (1974); McFeeters (1996); Xu (2006); Huete (1988, 2002) |
| Change detection | Change-vector analysis or index difference, Otsu threshold, 8-connected regions | Otsu, IEEE SMC 9(1) (1979) |
| Object detection | YOLO oriented bounding boxes over SAHI-style overlapping tiles, rotated-IoU non-maximum suppression | Ultralytics YOLO11-OBB; Akyon et al., *SAHI* (2022); DOTA dataset |

The unit tests reproduce published reference cases, including the Vallado SGP4 verification ephemeris, textbook Lambert and Gibbs examples, and simulated GNSS observations with known truth.
