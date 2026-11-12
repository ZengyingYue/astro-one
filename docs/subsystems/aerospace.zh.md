# 航天

[English](aerospace.md) | 中文

[航天包家族](../../packages/aerospace/README.zh.md)共享的约定与算法来源。[`@astro-one/astrodynamics`](../../packages/aerospace/astrodynamics/README.zh.md) 实现轨道与姿态算法；各工具包添加面向模型的参数、上限与结果渲染。该家族不拥有 `ctx` 服务、事件或 Session 数据。

## 单位与时间

面向模型的工具使用 km、km/s 与度，接受带 `Z` 或 UTC 偏移的 ISO 8601 时刻。算法库使用 km、km/s、弧度，以及自 Unix 纪元起的 UTC 毫秒数。TAI−UTC 遵循编译在代码中的 IERS 闰秒表；TT 为 TAI + 32.184 s；GPS 时间为 TAI − 19 s。恒星时采用 IAU-1982 GMST 加二分差；除非调用方提供 `dut1`，UT1 − UTC 为零。

## 参考系

| 参考系 | 含义 |
|---|---|
| GCRF | 惯性 J2000 平赤道与平春分点；默认输出参考系 |
| TEME | 真赤道、历元平春分点；SGP4 的输出参考系 |
| ITRF | 地固参考系；IAU-1976 岁差、IAU-1980 章动主要项、视恒星时与可选的 IERS 极移（`xp`、`yp`） |
| Geodetic | WGS-84 纬度、经度与椭球高 |
| RTN | 某一状态的径向、横向、法向坐标系，用于协方差与脱靶矢量 |

## 算法

| 能力 | 方法 | 来源 |
|---|---|---|
| 编目外推 | 通过 satellite.js 运行 SGP4/SDP4 | Vallado, Crawford, Hujsak, Kelso, *Revisiting Spacetrack Report #3*, AIAA 2006-6753 |
| 数值外推 | RKF7(8)，含 J2–J6 带谐项、指数大气阻力、带锥形阴影的球形太阳光压、日月引力 | Fehlberg, NASA TR R-287 (1968); Montenbruck and Gill, *Satellite Orbits* (2000) |
| 开普勒外推 | 普适变量与 Laguerre–Conway 迭代 | Vallado, *Fundamentals of Astrodynamics and Applications*, 4th ed. |
| Lambert | 支持多圈分支的 Izzo 求解器 | Izzo, *Revisiting Lambert's problem*, CMDA 121 (2015) |
| 初始定轨 | Gibbs、Herrick–Gibbs、带迭代修正的 Gauss 仅测角 | Vallado (2013); Curtis, *Orbital Mechanics for Engineering Students* |
| 精密定轨 | 带 sigma 剔除的 Levenberg–Marquardt 批处理最小二乘；无迹卡尔曼滤波 | Tapley, Schutz, Born, *Statistical Orbit Determination* (2004); Wan and van der Merwe (2000) |
| 碰撞概率 | Foster 2D 短时交会积分；Alfano 最大概率 | Foster and Estes, NASA JSC-25898 (1992); Alfano, *Relating position uncertainty to maximum conjunction probability* (2005) |
| 姿态确定 | TRIAD、Davenport q-method、带误差协方差的 QUEST | Shuster and Oh, JGC 4(1) (1981); Markley and Crassidis, *Fundamentals of Spacecraft Attitude Determination and Control* (2014) |
| GNSS 广播轨道 | GPS、Galileo、北斗 MEO/IGSO/GEO 星历与钟差 | IS-GPS-200, Galileo OS SIS ICD, BDS-SIS-ICD-B1I |
| GNSS 定位 | Klobuchar 电离层、Saastamoinen 对流层、加权最小二乘、RAIM 故障排除 | RTKLIB (Takasu) algorithms; Kaplan and Hegarty, *Understanding GPS/GNSS* |
| RTK | 双差扩展卡尔曼滤波、MLAMBDA 整数搜索、ratio 检验 | Teunissen (1995); Chang, Yang, Zhou, *MLAMBDA*, J. Geodesy 79 (2005) |
| 光谱指数 | NDVI、NDWI、MNDWI、NDBI、NBR、NDRE、NDSI、EVI、SAVI | Rouse (1974); McFeeters (1996); Xu (2006); Huete (1988, 2002) |
| 变化检测 | 变化矢量分析或指数差、Otsu 阈值、8 连通区域 | Otsu, IEEE SMC 9(1) (1979) |
| 目标检测 | 基于 SAHI 式重叠分块的 YOLO 旋转边界框，以及旋转 IoU 非极大值抑制 | Ultralytics YOLO11-OBB; Akyon et al., *SAHI* (2022); DOTA dataset |
| 轨道类别 | 近地点/远地点高度、半长轴、偏心率与倾角区间 | ESA Space Debris Office, *ESA's Annual Space Environment Report* |
| 编目碰撞筛查 | 远地点/近地点滤波、采样距离下界、距离变化率二分求最近接近时刻 | Hoots, Crawford, Roehrich, *An analytic method to determine future close approaches between satellites*, Celestial Mechanics 33 (1984) |
| 观测关联 | SGP4 预测短弧残差的卡方，并搜索沿迹时间偏差 | Vallado, *Fundamentals of Astrodynamics and Applications*, 4th ed., §10 |
| 机动检测 | 根数差分与中位数/MAD 稳健 z 分数；Gauss 方程 Δv | Lemmens and Krag, *Two-Line-Elements-Based Maneuver Detection Methods for Satellites in Low Earth Orbit*, JGCD 37(3) (2014) |
| 卫星亮度 | 漫反射（朗伯）球相位律；Kasten–Young 大气质量 | McCue, Williams, Morford, *Optical characteristics of artificial satellites*, Planet. Space Sci. 19 (1971); Kasten and Young, Applied Optics 28 (1989) |
| 光变曲线周期 | 带解析虚警概率的广义 Lomb–Scargle 周期图；相位色散最小化 | Zechmeister and Kürster, A&A 496 (2009); Stellingwerf, ApJ 224 (1978) |
| 轨道寿命 | 指数大气上的轨道平均 Gauss 阻力方程，RK4 积分 | King-Hele, *Satellite Orbits in an Atmosphere* (1987); B* 换算见 Vallado (2013) eq. 9-46 |
| TLE 拟合 | 春分点 SGP4 平根数的 Levenberg–Marquardt 微分改正 | Vallado and Crawford, *SGP4 Orbit Determination*, AIAA 2008-6770 |

单元测试复现已发表的参考算例，包括 Vallado SGP4 验证星历、教科书中的 Lambert 与 Gibbs 算例，以及已知真值的模拟 GNSS 观测。
