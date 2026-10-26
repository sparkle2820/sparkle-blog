---
title: "把 LingBot-VLA 2.0 训进 RoboTwin：185800 steps 终版实验记录"
description: "用经常死机的5090、无NVLink的双3090和借用H20探索LoRA模块取舍与推理优化：终版训练185800 steps，clean成功率71.90%，randomized成功率23.40%，附长训loss图和50任务明细。"
publishedAt: "2026-10-25T10:00:00"
updatedAt: "2026-10-26"
category: "engineering"
featuredImage: "/media/2026/10/lingbot-vla/cover_clean_success.jpg"
draft: false
---

这回模型终于交卷，训练步数定格在 **185800 steps**。回头看，我们的 GPU 确实有自己的排班表：模型正要加班，显卡可能已经决定下班；人刚睡着，checkpoint 就成了全组最值得牵挂的文件。好在这次账本和成绩单都保住了。

这轮后训练，我们把显存当生活费花：LoRA 先给哪些模块，哪些关键层值得咬牙全参解冻，训练之外还能不能靠推理配置省出一点成绩，都得一项项算。沿着这份账本，我们做了单任务和多任务训练、官方蒸馏、时间集成、JEPA 直接推理，也顺手让激活函数参加了一次“换岗面试”。最后收到的成绩单是 **clean 71.90%、randomized 23.40%**：熟悉场景已经有了起色，换个布景，模型仍然很有自己的想法。[终版结果](#final-results)

看看家底就知道这份账为什么算得这么细：有的参赛队伍配着 **8×H100、6×Pro 6000**，我们手里是一张**经常死机的 RTX 5090**、一对**没有 NVLink 的 RTX 3090**，再加一张**借来且屡次被中断的 H20**。5090 擅长突然休假，两张 3090 虽然住同一间机箱，显存却坚持各过各的，H20 则属于“今天能借多久，就先训多久”。所以我们的实验习惯里，除了看 loss，还得确认机器活着、checkpoint 存着、日志对得上。文章里的吞吐和训练预算，也请连同这套丐版装备一起看。

这比把一张漂亮的冒烟截图当成最终成绩更诚实，也更接近机器人实验真正的样子：模型会在一个 pot 上看起来像要成功，下一秒却把它推翻；一张 loss 曲线会继续下降，闭环成功率却停在原地；同一个时间集成算法换一份 checkpoint，方向也可能反过来。

![E014 冒烟评测中的 clean/seen 成功场景](/media/2026/10/lingbot-vla/cover_clean_success.jpg)

上图是 **C0 154800 checkpoint、N10、legacy P7** 的 `clean/seen` 冒烟帧。它证明的是这一集被成功计分，以及渲染和动作链路正常；它不代表 50 个任务的总体成功率。

## 先把问题说清楚：我们到底在优化什么

LingBot-VLA 2.0 是一个 Vision-Language-Action（VLA）模型：输入图像、指令和机器人状态，输出一段动作。它的 action expert 采用稀疏 MoE，并把不同 embodiment 的动作映射到统一的 55 维表示中。[官方技术报告与代码](https://arxiv.org/abs/2607.06403) [官方仓库](https://github.com/Robbyant/lingbot-vla-v2)

我们的目标不是让一条训练 loss 看起来更低，而是让同一份模型在 RoboTwin 2.0 的多任务闭环里更少失败，尤其是 `randomized/unseen`：物品位置、颜色、背景和纹理改变之后，模型仍然要找对东西、抓到东西，并在有限的动作执行窗口里完成任务。

因此每一轮都要同时回答四个问题：

1. **模型身份是否相同？** 起点、adapter、normalization、精度和推理参数必须绑定到 manifest。
2. **数据是否干净？** 训练使用 clean split；randomized 只作为测试域。
3. **改动究竟在哪里？** 是训练模块、loss、去噪器、时间集成，还是评测循环。
4. **闭环是否真的改善？** held-out loss 和开环误差只能做诊断，不能替代任务成功率。

仓库中每个实验目录都保存了 README、JSON、原始日志和复核脚本。[实验索引](https://github.com/Chenxibenxi/PhiZJU/tree/main/experiments) [成果总览](https://github.com/Chenxibenxi/PhiZJU/blob/main/experiments/reports/2026-10-24_results_sync/README.md)

## 我们的丐版算力拼图

| 设备 | 实际角色 | 已核验内容 |
|---|---|---|
| H20 96 GB，sm_90，借用 | 长程训练和大规模全任务评测 | 产出 D+1f@60000、154800 等阶段权重，最终训练到185800 steps；训练与评测受外部占用中断 |
| LXC RTX 3090 ×2，sm_86，无 NVLink | 快速闭环筛选、单任务对照、双卡时间集成 | E001–E013 多数推理消融和 E014 JEPA-affinity 评测；GPU0/GPU1 并行验证 delay_select 与 medoid；两张卡各自跑格子，并没有组成一张大显存卡 |
| RTX 5090，32 GB，单卡 | 训练尝试与并行评测候选 | 机器经常死机，因此只把能留下完整 checkpoint、日志和结果的运行计入结论 |

## LoRA 也得省着训：先决定把参数花在哪里

“资源紧张就用 LoRA”只说完了前半句。我们连 LoRA 都要按模块精打细算，更谈不上让模型全部参数一起更新。基座权重、前向激活和反向计算仍然要占资源；从只适配 action expert 到扩大视觉、语言侧的覆盖，训练的成本和能改变的行为都会变化。我们的日常更像给显存做预算：动作头申请一点，视觉编码器申请一点，最后由 OOM 担任财务总监。

LoRA 的基本做法是冻结原权重 `W`，训练低秩增量 `ΔW = (α/r)BA`。**“对一个模块使用 LoRA”不等于“这个模块的全部原始权重都在训练”**；“全位置 LoRA”在我们的配置里也只是指定 attention 位置的覆盖范围。少量边界模块的全参训练则另用正则明确指定，两者共同构成最终可训集合。[LoRA 原论文](https://arxiv.org/abs/2106.09685)、[实际训练配置](https://github.com/Chenxibenxi/PhiZJU/blob/main/experiments/E008_result_catalog/results/raw/tools/f1_C_ft.yaml)

| 配方 | 参数预算投向哪里 | 归档可训参数量 |
|---|---|---:|
| C：action attention LoRA r32 | 先让动作专家适配任务，视觉／语言骨干保持冻结 | 约1534万 |
| D：扩大 attention LoRA 覆盖 | 将低秩适配扩到语言、视觉与动作侧的指定 attention 位置 | 约4360万 |
| C＋1f | action attention LoRA，加五个输入／输出与时间边界模块全参 | 17,234,743 |
| 1a | 在 C＋1f 上增加 router 和 shared expert 全参 | 约7651万 |
| 2a | 在 C＋1f 上增加 ViT attention／MLP LoRA，以及视觉 merger 全参 | 约1.389亿 |

这些是不同实验的可训集合，**不是同一条长训把所有模块逐个叠满**。C/D 的早期显存标定、1f 配置与 1a/2a 的4500步记录分别保留，不能把不同数据预算的结果直接排成一张“参数越多越好”的排行榜。[C/D 参数与显存记录](https://github.com/Chenxibenxi/PhiZJU/blob/main/common/records/facts.md)、[1a/2a 实验](https://github.com/Chenxibenxi/PhiZJU/tree/main/experiments/E005_module_unfreezing)

### 为什么会挑出五个 1f 模块

1f 保留 action attention LoRA，额外训练 `state_proj`、`action_in_proj`、`action_out_proj`、`action_time_mlp_in` 和 `action_time_mlp_out`：它们负责把本体状态、带噪动作和 flow time 接入动作分支，并把结果投回动作空间。新增全参预算约190万，优先修改输入／输出接口，而不是直接解冻整套专家。

![C、C＋1f 与关键帧加权方案的训练和闭环对照](/media/2026/10/lingbot-vla/f1_compare.png)

在这次 `lift_pot` 探针里，4500步留出首步手臂误差从 C 的约0.083 rad 到 C＋1f 的0.0476 rad；10集闭环为0/10对4/10。同checkpoint的另一次录像评测只有1/10，因此这组结果只能作为支持继续探索的信号。C 与 f1_C 还使用了不同 normalization，不能把全部差值单独归因于解冻模块。上图也保留了关键帧三倍采样的负结果：f1_A 留出误差0.0684 rad，闭环0/10。[逐帧误差与闭环记录](https://github.com/Chenxibenxi/PhiZJU/tree/main/experiments/E003_training_ablations)

### Router、shared expert，还是视觉侧

随后在同为 `lift_pot` clean50、4500步的 1a/2a 中，原生 N10 分别为4/30与2/30；N1＋时间集成分别为15/30与27/30。2a 的视觉扩展在这批闭环记录里得到较高点估计，但它的 randomized 开环误差也更高，证据仍受单训练seed和小样本限制。

对我们来说，“LoRA 训练效益最大化”的含义是：在能完成训练、保存、导出和闭环验收的预算内，比较把参数投到哪里更值得。它是一条模块选择的探索路线，现有实验还不能证明找到了全局最优配置。完整 routed experts 解冻则单列为更大预算的方案，不混作已经完成的收益。[模块消融与扩展方案](https://github.com/Chenxibenxi/PhiZJU/tree/main/experiments/E005_module_unfreezing)

## 第一阶段：先让一台模型真的动起来

最早的基座模型在 `lift_pot` 上 clean 和 randomized 都是 0/10。完整视频显示，模型有时能让双臂靠近 pot，却没有稳定的双手抓取和抬升。这个阶段最重要的成果不是一个高分，而是把错误拆成可观察的链路：目标是否找对、手是否到位、夹爪是否在正确时间闭合、pot 是否保持 upright。

![基座模型 clean 冒烟视频第8秒的 pot 场景](/media/2026/10/lingbot-vla/base6b_clean_frame8.png)

这张帧来自真实评测视频。它展示了失败场景的视觉状态，不能单独告诉我们失败发生在哪个物理条件；对应的原始 MP4、episode 日志和 `meta.json` 保存在本地验收目录中。

### E001–E005：LoRA、1f 和最初的动作推理消融

第一批实验在 LXC 的 BF16 3090 环境中完成，围绕 `lift_pot` 和 `move_playingcard_away` 建立可重复的基线。

| 实验 | 改动 | 已记录结果 |
|---|---|---|
| E001 | 去噪步数 × 时间集成 | f1_C@4500 的 `lift_pot`：默认 N10 无集成 9/30，N10＋集成 25/30，N1＋集成 28/30；开环最优步数和闭环最优步数不一致 |
| E002 | 队友的时间集成矩阵 | 记录了 16 个有效格，包含官方参考、f1C 和 S4P1M2；task mismatch 单独保留 |
| E003 | 训练采样、时间混合、AdaRMSNorm、9000 步 | f4 默认闭环从 4/30 到 28/30；N1＋集成从 25/30 到 29/30 |
| E004 | 扑克牌任务与 12500 步模型 | `move_playingcard_away`：默认 19/30，集成 22/30，集成＋N1 18/30，仅重规划 16/30 |
| E005 | 1a/2a 模块解冻 | 集成＋N1 的两格为 15/30、27/30；完整 MoE 解冻方案作为后续训练说明保留 |

E008 不是一个新的模型干预，而是把前面分散在 LXC、H20 和中继机上的 88 次执行、94 组开环记录和 2210 条逐集 seed 收成一个可复核目录。它把 completed、rejected、task mismatch 和 incomplete 分开，避免把一次串错任务或启动失败写进成绩表。[E008 证据目录](https://github.com/Chenxibenxi/PhiZJU/tree/main/experiments/E008_result_catalog)

![早期 C/D 单任务 LoRA 的训练、留出 loss 与闭环诊断曲线](/media/2026/10/lingbot-vla/training_openloop_curves.png)

这张图把一个容易被忽略的事实放在一起：训练 loss 可以持续下降，开环动作误差也可以改善，但真正的闭环结果仍然要单独测。相关工作包括 LingBot-VLA 2.0 的 action expert 与 RoboTwin 后训练配方，不能把单任务小样本差异扩写成多任务结论。[E003 结果](https://github.com/Chenxibenxi/PhiZJU/tree/main/experiments/E003_training_ablations) [LingBot-VLA 2.0](https://arxiv.org/abs/2607.06403)

### 50 个任务的第一个强参照：E007、E011

H20 D+1f@60000 是我们第一个完整的 50-task 参照，协议固定为 `seen + demo_clean`，每个任务 30 回合，共 1500 回合。

| 推理设置 | 成功数 | 成功率 |
|---|---:|---:|
| 原生 N10，无时间集成 | 744/1500 | 49.60% |
| N5＋时间集成 | 946/1500 | 63.07% |
| N1＋时间集成 | 822/1500 | 54.80% |

这里的 +13.47pp 是 **N5 与时间集成共同改变后的联合收益**，不是纯时间集成的因果增益。`click_bell` 甚至从原生 7/30 变成 N5 集成 1/30，再在 N1 集成回到 15/30；这也是为什么我们没有把一个配置直接推广到所有 checkpoint。

![E001 f1_C@4500 的单任务时间集成矩阵与逐场景结果](/media/2026/10/lingbot-vla/ensemble_matrix.png)

上图展示早期 `lift_pot` 单任务筛查，和本节的60000步全任务表具有不同checkpoint与样本范围。

这批结果受到动作 chunking 和 temporal ensembling 文献的启发。尤其是 “Why Does Action Chunking Improve Behavior Cloning?” 对时间延迟、多源动作和均值策略的讨论，帮助我们把“看起来更平滑”拆成可测的候选；这不是对论文实验的复现，而是固定 LingBot checkpoint 后的工程消融。[E007](https://github.com/Chenxibenxi/PhiZJU/tree/main/experiments/E007_multitask_status) [E011](https://github.com/Chenxibenxi/PhiZJU/tree/main/experiments/E011_h20_60000_ns1_fullsuite) [P07 论文证据](https://github.com/Chenxibenxi/PhiZJU/blob/main/experiments/E013_temporal_posthoc_papers/source_ledger.md)

## 把失败视频也留下来

同一份 f1_C@4500 评测中，10 集视频只有 episode5 成功。成功集和失败集的差异不是“模型有没有输出”，而是动作有没有在接触阶段保持一致：有的 episode 双手接近后 pot 被撞翻，有的双手离 handle 只有不到 1 cm，却没有形成有效抓取。

| 成功视频帧 | 失败视频帧 |
|---|---|
| ![f1_C episode5 成功视频帧](/media/2026/10/lingbot-vla/f1c_episode5_success_late.png) | ![f1_C episode0 失败视频帧](/media/2026/10/lingbot-vla/f1c_episode0_failure_late.png) |

这两张图来自评测 MP4 的定点抽帧；它们用于展示机器人现场，不替代 episode 计分。原始记录显示这份重复评测为 1/10，和无视频的同 checkpoint 4/10 一起只能写成 5/20 的现场汇总。[E003 原始计分记录](https://github.com/Chenxibenxi/PhiZJU/tree/main/experiments/E003_training_ablations)

## E006：官方蒸馏到底改变了什么

官方深度、future-depth 和 future-video alignment 被加入 2a 训练。100-step 探针的显存峰值为 **23485 MiB**；`global_step_4500` 的两格闭环结果是：

- 原生 N10、无集成：6/30；
- N1＋时间集成：27/30。

两格共同 scene seed 为 28 个，其中 21 个只在集成组合成功，0 个只在原生组合成功。由于去噪步数和时间集成同时变化，正确的表述是“这份蒸馏 checkpoint 的两种推理组合差异”，而不是单独把 +70pp 归因给蒸馏 loss。[E006 结果与复核脚本](https://github.com/Chenxibenxi/PhiZJU/tree/main/experiments/E006_official_distillation)

论文背景来自 LingBot-VLA 2.0 自身的预测表征设计：LingBot-Depth 和 DINO-Video 被用来提供几何与时间先验。这个实验是在现有训练链路里复用官方蒸馏接口，不能写成对新论文方法的完整复现。[LingBot-VLA 2.0 technical report](https://arxiv.org/abs/2607.06403)

## E009–E013：时间集成从“技巧”变成可审计配置

### 单任务和续训对照

E009 对 `click_bell` 做了同一 H20 D+1f@60000 checkpoint 的三格对照：N10＋集成 2/30、N5 无集成 5/30、N1＋集成 15/30。E010 则比较 f1_C@4500 权重重置 optimizer 后续训到 9000，与直接连续训练到 9000：N10 原生从 27/30 到 23/30，N1＋集成均为 29/30。

E012 在 `lift_pot` 的 `unseen + randomized` 上测了续训模型：原生 2/30，N1＋集成 10/30。这个 +26.67pp 很有价值，但仍然是单任务和单 checkpoint，不能当作全任务随机化结论。[E009](https://github.com/Chenxibenxi/PhiZJU/tree/main/experiments/E009_clickbell_denoise_ensemble) [E010](https://github.com/Chenxibenxi/PhiZJU/tree/main/experiments/E010_f1c_weights_continuation) [E012](https://github.com/Chenxibenxi/PhiZJU/tree/main/experiments/E012_liftpot9000_unseen_randomized)

### E013：为什么 P7 仍然是强参照

我们把十篇后处理论文逐篇读成可验证组件，而不是直接把整套方法塞进客户端。P7（Why Chunking Improves Behavior Cloning）最接近当前低成本的 cached-delay 时间集成；GeoAAC 只做 log-only geometry 诊断；REMAC 只保留 prefix-mask 候选；CommitFlow、CereVLA、VLA-Feedback、FBFM、SpecPrune、Speedup Patch 和 CorrectVLA 都被拆成边界明确的候选，而不是宣称已经接入。

同一份 60000 checkpoint、BF16、N5、stride10、`seen + demo_clean` 下：

| 方法 | 覆盖 | 成功 | 成功率 |
|---|---:|---:|---:|
| P7 legacy | 50 tasks × 30 | 946/1500 | 63.07% |
| delay_select | 50 tasks × 20 | 523/1000 | 52.30% |
| medoid | 50 tasks × 20 | 577/1000 | 57.70% |

两种新方法都低于 P7。paired seed 交集和 task-cluster 区间保存在 canonical JSON 中；因为回合预算不同，不能把三列当成完全对称的实验。[E013 逐任务 JSON](https://github.com/Chenxibenxi/PhiZJU/blob/main/experiments/E013_temporal_posthoc_papers/results/fullsuite20/task_rates.json) [十篇论文 source ledger](https://github.com/Chenxibenxi/PhiZJU/blob/main/experiments/E013_temporal_posthoc_papers/source_ledger.md)

![E001 f1_C@4500 单任务 denoising sweep 的开环与闭环对照](/media/2026/10/lingbot-vla/ensemble_sweep.png)

上图是 E001 的单任务 sweep；E013 的全任务比较以上表和逐任务 JSON 为准。

十篇后处理论文的完整引用与迁移边界：

1. **SpecPrune-VLA**：action-aware speculative pruning；本轮只作为计算预算候选，上传 PDF 的真实性与代码发布状态按 source ledger 记录。
2. **CommitFlow**（[arXiv:2609.21908](https://arxiv.org/abs/2609.21908)）：语义 commitment verification 与局部恢复；当前缺少阶段、holding 和 contact 标签。
3. **CereVLA**（[arXiv:2609.27468](https://arxiv.org/abs/2609.27468)）：consequence-aware residual governance；当前只借鉴“收益与伤害分开计数”。
4. **GeoAAC**（[arXiv:2609.20776](https://arxiv.org/abs/2609.20776)）：从 denoising trajectory 推导 action chunking；当前只做 N5 log-only 诊断。
5. **VLA-Feedback**（[arXiv:2609.21022](https://arxiv.org/abs/2609.21022)）：冻结 planner、最后一步引入新视觉反馈；需要新的小反馈头和 per-tick observation contract。
6. **FBFM**（[arXiv:2607.29235](https://arxiv.org/abs/2607.29235)）：异步反馈 flow matching；完整方法依赖 world-action model，不等于当前 action-only 推理。
7. **Why Does Action Chunking Improve BC?**（上传 PDF `2608.02547_WhyChunkingImprovesBC.pdf`）：时间集成与 delayed action 的直接理论参照；物理页码和 hash 见 source ledger。
8. **REMAC**（[arXiv:2601.20130](https://arxiv.org/abs/2601.20130)）：masked action chunking；当前实现是 prefix-mask 组件，不是完整 self-conditioned 方法。
9. **Speedup Patch / SuP**（上传 PDF `iJNYi8dwr4_SpeedupPatch.pdf`）：动作执行密度和物理 waypoint 调整；不等于 solver denoising skip。
10. **CorrectVLA**（[arXiv:2608.29967](https://arxiv.org/abs/2608.29967)）：language feedback action correction；absolute joint 空间不能直接套 Cartesian offset。

## E014：JEPA 直接推理，而不是先假设它有效

JEPA 是 Joint-Embedding Predictive Architecture；Jev/System One 是 TypeSafe 的结构化决策接口，两者不是同一件事。我们先选择了公开、冻结的 **V-JEPA 2 ViT-L**，把当前图像复制成短因果窗口，提取 patch feature，经坐标对齐和归一化后，把 affinity 作为 bias 注入 LingBot 最后一个 Qwen vision attention block。没有训练新的 fusion head，也没有把它写成“JEPA 一定提高了成功率”。

实际直接推理结果：

| split | 成功 | 成功率 | 覆盖 |
|---|---:|---:|---:|
| clean / seen | 698/1000 | 69.80% | 50 tasks × 20 |
| randomized / unseen | 246/1000 | 24.60% | 50 tasks × 20 |

这是两格 JEPA-affinity 的绝对成绩，不是相对 C0 的因果增益。它使用 BF16、N10、legacy P7、stride10；要证明 JEPA 有独立收益，必须补齐同样精度、P7、episode 预算和 actual seed 的 C0 对照。[E014 结果](https://github.com/Chenxibenxi/PhiZJU/tree/main/experiments/E014_jepa_vla_fusion)

![C0 154800 N10＋P7 的 clean/seen 冒烟视频帧](/media/2026/10/lingbot-vla/e014_video_clean_success.png)

![C0 154800 N10＋P7 的 randomized/unseen 冒烟视频帧](/media/2026/10/lingbot-vla/e014_video_randomized_failure.png)

上面两张图来自 C0 154800 N10＋P7 的真实 smoke 视频，一张对应 clean/seen 成功 episode，一张对应 randomized/unseen 失败 episode，用来展示场景外观差异。JEPA-affinity 的两组成绩由上表各1000条逐集记录支持。

JEPA-VLA 已经提供了“冻结 V-JEPA 2 特征＋gated cross-attention 接入 VLA”的公开先例；VLA-JEPA 则走未来 latent supervision。我们因此把“训练式 JEPA fusion”和“冻结 encoder 直接推理”分开写。[JEPA-VLA](https://arxiv.org/abs/2602.11832) [VLA-JEPA](https://arxiv.org/abs/2602.10098) [V-JEPA 2 官方仓库](https://github.com/facebookresearch/vjepa2)

### E014 之前，哪些训练想法只是设计

AGFT-inspired image/action alignment、Weak-SIGReg、TC-SIGReg 和 DFT 都被写入了候选方案，但当前文章不把它们写成已完成实验：

- **AGFT**（[arXiv:2609.34467](https://arxiv.org/abs/2609.34467)）适合作为保留 native flow-matching、额外加一个对齐项的训练消融。
- **Weak-SIGReg**（[arXiv:2603.05924](https://arxiv.org/abs/2603.05924)）和 **TC-SIGReg**（[arXiv:2607.26924](https://arxiv.org/abs/2607.26924)）需要明确统计 batch、sketch rank 和时间中心化轴。
- **DFT**（[arXiv:2508.05629](https://arxiv.org/abs/2508.05629)）的离散 target-token probability 与当前连续 flow-matching loss 不同，不能直接把 `exp(-FM error)` 当成论文中的概率。

它们在博客里出现，是因为它们决定了下一轮实验怎么设计；不是因为它们已经为这份 VLA 带来了提升。

## 探索实验 E016：换掉 shared expert 的激活函数会怎样

在参数模块选择之外，我们还做了一次小范围激活函数探索：保持 LoRA＋1f 的可训范围，只替换 action shared-expert 的36个激活位置，比较 SiLU、ReLU、PReLU。三臂均为seed42、6000 updates，闭环固定BF16、N5、无时间集成。

SiLU 对输入做平滑门控；ReLU 将负半轴置零；PReLU 则让负半轴斜率 `a` 参与学习。这里每个 shared expert 只增加一个 slope，初值0.1，总共新增36个标量，可训参数从17,234,743到17,234,779。它测试的是这36个位置的改动，而非将整套视觉、语言和动作网络的激活全部替换。[PReLU 原论文](https://arxiv.org/abs/1502.01852)、[Swish／SiLU 相关研究](https://arxiv.org/abs/1710.05941)、[实际训练范围与参数清单](https://github.com/Chenxibenxi/PhiZJU/tree/main/experiments/E016_activation_functions)

| 激活 | held-out VLA loss | move_playingcard_away | lift_pot |
|---|---:|---:|---:|
| SiLU | 0.0459193 | 36/60 | 0/30 |
| ReLU | 0.0495592 | 36/60 | 0/30 |
| PReLU | 0.0475137 | 37/60 | 0/30 |

每臂的 held-out loss 来自5条留出episode、40个固定frame、每帧2个noise seeds，共80次观测；闭环总计270回合。PReLU在扑克牌上多成功1集，仍未达到原定的至少10pp闭环改善和至少5%留出loss改善门槛。ReLU、PReLU的留出loss点估计都高于SiLU，因此这次探索保留负结果，继续使用SiLU筛查基线。它也没有建立“SiLU饱和导致长训停滞”的因果证据。[E016 原始记录与负控](https://github.com/Chenxibenxi/PhiZJU/tree/main/experiments/E016_activation_functions)

<a id="final-results"></a>

## 终版：185800 steps，全50任务结果

最终训练步数由作者确认为 **185800 steps**，成绩采用队伍 `PHIZJU` 提供的终版 `results.json`。文件分别记录50个 `clean` 任务和50个 `randomized` 任务，每任务20回合，两域各1000回合。

| 评测域 | 成功数／回合数 | 总成功率 | 覆盖 |
|---|---:|---:|---|
| clean | **719/1000** | **71.90%** | 50 tasks × 20 episodes |
| randomized | **234/1000** | **23.40%** | 50 tasks × 20 episodes |

![185800 steps终版：clean为719/1000，randomized为234/1000](/media/2026/10/lingbot-vla/final_results_185800.png)

图表由下方同一份JSON直接生成。每个任务的回合数相等，因此这里的总成功率也等于该域50任务成功率的宏平均；两域相差 **48.50个百分点**，仍有明显的场景泛化落差。

### 哪些任务保住了，哪些任务掉得厉害

`shake_bottle` 和 `shake_bottle_horizontally` 在两个域均为20/20；`place_cans_plasticbox`、`press_stapler` 的 randomized 均为15/20。另一边，`lift_pot` 从clean的18/20到randomized的0/20，`move_playingcard_away` 从19/20到2/20。randomized共有12个任务为0/20。单看clean总分，很容易漏掉这些具体短板。

<details>
<summary>展开50个任务的终版计数与成功率</summary>

<!-- final-task-table:start -->
| task | clean | randomized |
|---|---:|---:|
| adjust_bottle | 19/20（95.00%） | 1/20（5.00%） |
| beat_block_hammer | 13/20（65.00%） | 0/20（0.00%） |
| blocks_ranking_rgb | 18/20（90.00%） | 6/20（30.00%） |
| blocks_ranking_size | 12/20（60.00%） | 1/20（5.00%） |
| click_alarmclock | 12/20（60.00%） | 9/20（45.00%） |
| click_bell | 18/20（90.00%） | 12/20（60.00%） |
| dump_bin_bigbin | 19/20（95.00%） | 14/20（70.00%） |
| grab_roller | 20/20（100.00%） | 9/20（45.00%） |
| handover_block | 12/20（60.00%） | 0/20（0.00%） |
| handover_mic | 12/20（60.00%） | 1/20（5.00%） |
| hanging_mug | 4/20（20.00%） | 0/20（0.00%） |
| lift_pot | 18/20（90.00%） | 0/20（0.00%） |
| move_can_pot | 18/20（90.00%） | 1/20（5.00%） |
| move_pillbottle_pad | 15/20（75.00%） | 3/20（15.00%） |
| move_playingcard_away | 19/20（95.00%） | 2/20（10.00%） |
| move_stapler_pad | 3/20（15.00%） | 0/20（0.00%） |
| open_laptop | 19/20（95.00%） | 1/20（5.00%） |
| open_microwave | 6/20（30.00%） | 3/20（15.00%） |
| pick_diverse_bottles | 9/20（45.00%） | 2/20（10.00%） |
| pick_dual_bottles | 13/20（65.00%） | 4/20（20.00%） |
| place_a2b_left | 9/20（45.00%） | 2/20（10.00%） |
| place_a2b_right | 13/20（65.00%） | 3/20（15.00%） |
| place_bread_basket | 18/20（90.00%） | 9/20（45.00%） |
| place_bread_skillet | 15/20（75.00%） | 6/20（30.00%） |
| place_burger_fries | 20/20（100.00%） | 11/20（55.00%） |
| place_can_basket | 17/20（85.00%） | 0/20（0.00%） |
| place_cans_plasticbox | 18/20（90.00%） | 15/20（75.00%） |
| place_container_plate | 20/20（100.00%） | 6/20（30.00%） |
| place_dual_shoes | 11/20（55.00%） | 0/20（0.00%） |
| place_empty_cup | 18/20（90.00%） | 2/20（10.00%） |
| place_fan | 8/20（40.00%） | 0/20（0.00%） |
| place_mouse_pad | 8/20（40.00%） | 0/20（0.00%） |
| place_object_basket | 15/20（75.00%） | 3/20（15.00%） |
| place_object_scale | 15/20（75.00%） | 2/20（10.00%） |
| place_object_stand | 19/20（95.00%） | 13/20（65.00%） |
| place_phone_stand | 13/20（65.00%） | 0/20（0.00%） |
| place_shoe | 15/20（75.00%） | 3/20（15.00%） |
| press_stapler | 19/20（95.00%） | 15/20（75.00%） |
| put_bottles_dustbin | 2/20（10.00%） | 0/20（0.00%） |
| put_object_cabinet | 11/20（55.00%） | 3/20（15.00%） |
| rotate_qrcode | 17/20（85.00%） | 0/20（0.00%） |
| scan_object | 12/20（60.00%） | 2/20（10.00%） |
| shake_bottle | 20/20（100.00%） | 20/20（100.00%） |
| shake_bottle_horizontally | 20/20（100.00%） | 20/20（100.00%） |
| stack_blocks_three | 16/20（80.00%） | 8/20（40.00%） |
| stack_blocks_two | 20/20（100.00%） | 13/20（65.00%） |
| stack_bowls_three | 13/20（65.00%） | 4/20（20.00%） |
| stack_bowls_two | 19/20（95.00%） | 2/20（10.00%） |
| stamp_seal | 9/20（45.00%） | 1/20（5.00%） |
| turn_switch | 10/20（50.00%） | 2/20（10.00%） |
<!-- final-task-table:end -->

</details>

[下载原始 results.json](/media/2026/10/lingbot-vla/results_185800.json) · [查看矢量结果图](/media/2026/10/lingbot-vla/final_results_185800.svg)

### 终版结论和证据口径

**这份终版结果支持的结论是：clean达到71.90%，randomized为23.40%，泛化短板依然存在。** 相比文中60000步参照，clean点估计更高，但这份汇总文件没有记录精度、去噪步数、P7开关、指令池、checkpoint hash或actual seeds；所以本节沿用文件的 `clean`／`randomized` 标签，不把差值单独归因于长训、时间集成或JEPA。

本次复核覆盖JSON结构、两域相同的50任务名称、每格20回合、成功数合法性和汇总重算。185800步身份依据作者确认，逐集去重与运行配置身份需要对应的日志和manifest支持。

### 长训 loss 和任务成功率，放在一起看

[![作者提供的1至185800步长训loss曲线与全50任务结果，loss里程碑数值待原始CSV复核](/media/2026/10/lingbot-vla/training_loss_and_tasks_185800.jpg)](/media/2026/10/lingbot-vla/training_loss_and_tasks_185800.jpg)

上图由作者提供，点击可以查看原尺寸。上半部分标注了每10步的原始loss，以及500步和5000步EMA平滑曲线；在154800步处，图示学习率由cosine阶段的 `1e-4 → 5e-5` 切换到恒定 `1e-4`。分界前loss整体下降，分界后抬升至另一个波动水平。

**原图注明：loss里程碑数值尚待原始CSV统一复核。** 因此本文将它作为作者提供的训练过程图，按趋势解读；不会仅凭曲线抬升，就判定发生了过拟合或证明学习率切换导致了某个成功率变化。图下50任务两列的100个百分比已与原始JSON逐项核对一致。

终版成绩计数和这张训练过程图分别保留来源；前文早期C/D、1f及单任务曲线继续按各自实验标注。loss帮助定位训练变化，71.90%与23.40%的闭环结果则回答了模型最终能完成多少任务。

## 这次实验留下的几条方法论

第一，训练 loss、开环误差、冒烟视频和闭环成功率是四种不同证据。它们应该互相解释，不能互相替代。

第二，时间集成不是模型的“免费升级”。它对 60000 checkpoint 的 P7 N5 有效，但 delay_select 和 medoid 在相同场景上都输给 P7；一个方法如果把多个运动模式平均成一条不存在的轨迹，平滑反而可能是坏事。

第三，JEPA 的直接推理结果已经足够说明“表征增强值得测”，还不足以说明“JEPA 已经解决 randomized/unseen”。真正的对照必须绑定 checkpoint、精度、P7、seed 和 episode 预算。

第四，失败视频不是宣传素材的反面。它们把“接近物体但没有抓取”“抓到了又把物体撞翻”“在随机纹理里找错目标”变成可以继续做诊断的证据。

## 引用与完整证据

- LoRA：Hu et al., *LoRA: Low-Rank Adaptation of Large Language Models*，[`arXiv:2106.09685`](https://arxiv.org/abs/2106.09685)。
- PReLU：He et al., *Delving Deep into Rectifiers*，[`arXiv:1502.01852`](https://arxiv.org/abs/1502.01852)。
- Swish：Ramachandran et al., *Searching for Activation Functions*，[`arXiv:1710.05941`](https://arxiv.org/abs/1710.05941)。
- LingBot-VLA 2.0：[`arXiv:2607.06403`](https://arxiv.org/abs/2607.06403)，[Robbyant/lingbot-vla-v2](https://github.com/Robbyant/lingbot-vla-v2)。
- JEPA-VLA：[`arXiv:2602.11832`](https://arxiv.org/abs/2602.11832)。
- VLA-JEPA：[`arXiv:2602.10098`](https://arxiv.org/abs/2602.10098)。
- AGFT：[`arXiv:2609.34467`](https://arxiv.org/abs/2609.34467)。
- Weak-SIGReg：[`arXiv:2603.05924`](https://arxiv.org/abs/2603.05924)。
- Temporally Centered SIGReg：[`arXiv:2607.26924`](https://arxiv.org/abs/2607.26924)。
- DFT：[`arXiv:2508.05629`](https://arxiv.org/abs/2508.05629)。
- 十篇时间集成与后处理论文的上传版本、物理页码、SHA256 和迁移边界：[PhiZJU source ledger](https://github.com/Chenxibenxi/PhiZJU/blob/main/experiments/E013_temporal_posthoc_papers/source_ledger.md)。其中可公开定位的论文包括 [CommitFlow](https://arxiv.org/abs/2609.21908)、[CereVLA](https://arxiv.org/abs/2609.27468)、[GeoAAC](https://arxiv.org/abs/2609.20776)、[VLA-Feedback](https://arxiv.org/abs/2609.21022)、[FBFM](https://arxiv.org/abs/2607.29235)、[REMAC](https://arxiv.org/abs/2601.20130) 和 [CorrectVLA](https://arxiv.org/abs/2608.29967)。

本文的阶段实验可追溯到 [PhiZJU 实验目录](https://github.com/Chenxibenxi/PhiZJU/tree/main/experiments)；185800步终版成绩以队内提供的[原始 results.json](/media/2026/10/lingbot-vla/results_185800.json)为来源。正文保留各次实验的任务、checkpoint、精度和预算边界，终版计数与历史诊断分别报告。
