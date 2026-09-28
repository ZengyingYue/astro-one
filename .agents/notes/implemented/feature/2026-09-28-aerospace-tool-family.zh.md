# Agent Note: Aerospace tools as an optional in-process bundle

Status: implemented

[English](2026-09-28-aerospace-tool-family.md) | 中文

## 问题

Astro One 面向航天任务，但此前模型没有相应的数值工具。要回答卫星在哪里、何时飞过测站、哪条轨道符合跟踪数据、GNSS 接收机在哪里，或两幅卫星影像之间有什么变化，模型只能通过 `bash` 或 `run_code` 编写并运行临时代码。这些代码需要重新安装库、重新实现参考系与时间尺度，且未经评审和测试。与此同时，通用部署不应为从不使用的工具付出 schema token 或意外的安装成本。

## 决策

三个面向模型的工具包共用 [`packages/aerospace/`](../../../../packages/aerospace/README.zh.md) 下的一个算法库。[`@astro-one/astrodynamics`](../../../../packages/aerospace/astrodynamics/README.zh.md) 以 TypeScript 实现时间尺度、参考系、SGP4（通过 satellite.js）、RKF7(8) 特殊摄动、Lambert、初始与精密定轨、碰撞概率和姿态确定。`tool-astrodynamics`、`tool-gnss` 与 `tool-remote-sensing` 添加面向模型的工具。每个工具在模型边界校验参数，通过 `ctx.fs` 读取文件，并渲染紧凑的文本或 JSON。

[`@astro-one/aerospace`](../../../../packages/bundle/aerospace/README.zh.md) 以明确的上限插入三条工具行，并列在 `OPTIONAL_BUNDLES` 中，因此 Plugins 页面默认以关闭状态提供它。每个数值上限都是必填的 `Config` 字段，其取值写在 bundle patch 中。

目标检测通过 ONNX Runtime 运行用户提供的 Ultralytics YOLO-OBB 模型。本包不附带权重；只有当 `detector` 指向已存在的绝对模型路径时才注册 `rs_detect_objects`，ONNX 会话作为插件 effect 在卸载时释放。

## 被否决的替代方案

**封装 Orekit、GMAT 或 RTKLIB 等外部引擎。** 它们功能更完整，但需要 JVM、原生构建或子进程协议，还会把失败处理与取消移到工具运行时之外。用 TypeScript 移植所需算法，可使每个工具都在进程内运行、可取消且覆盖率达到 100%。算法遵循已发表的来源，子系统页面逐一列出。

**把工具加入 `@astro-one/base`。** 那样每个会话都会多带十个 schema，所有用户都会看到航天工具。可选 bundle 让默认产品保持不变，并复用现有的插件管理器启用路径。

**附带检测权重。** 预训练的 DOTA 权重有各自的许可证，体积达数十 MB，其类别集也只适合部分影像。可配置的模型路径让每个部署自行选择权重与类别，工具描述会列出配置的类别名称。

**基于 Python 或 GDAL 的栅格处理。** GDAL 可提供重投影与窗口读取，但需要原生安装。geotiff.js 与 sharp 在 Node 内即可覆盖 GeoTIFF、COG 与常见图像格式。缺失的几何变换与窗口读取已列为已知限制。

## 影响

- 模型无需编写数值代码即可获得经过校验与测试的轨道、GNSS 和对地观测工具；结果使用固定的单位与舍入。
- 精度属于任务规划级而非精密级：截断章动、带谐重力、指数大气、广播星历与短基线 RTK。各包 README 说明了每项限制。
- 即使 bundle 处于禁用状态，安装 CLI 也会安装 `satellite.js`、`geotiff`、`sharp` 与 `onnxruntime-node`。
- 生成的工具目录展示不含检测器的 schema；配置了检测器的部署还会公开 `rs_detect_objects`，其描述随类别列表变化。
