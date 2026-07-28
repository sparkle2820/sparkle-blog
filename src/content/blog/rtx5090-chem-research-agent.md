---
title: "我在 Windows + RTX 5090 上搭了一套化学科研 Agent：实测 208 token/s，接入五类专业软件"
description: "从 Qwen3.5-35B-A3B 本地推理、RAG、Open WebUI，到 MATLAB、Python、OpenFOAM、Aspen Plus、Fluent 和远程 Codex，记录一套真正跑通的 Windows 化学科研 Agent。"
publishedAt: "2026-07-28T10:30:00"
category: "engineering"
featuredImage: "/media/2026/07/rtx5090-chem-agent-workbench.jpg"
draft: false
---

这套系统是在一台 Windows 工作站上搭出来的。硬件核心是一张 RTX 5090 32 GB，主模型是 Qwen3.5-35B-A3B 的 Q4_K_M GGUF。现在它能做三件事：给课题组提供局域网模型服务，从 PDF 和 Word 文档里检索带出处的内容，以及在人工批准后调用 MATLAB、Python、OpenFOAM、Aspen Plus 和 Fluent。

先把最直观的结果放在前面。单并发、32K context、关闭 thinking 的一次真实 API 请求中，输入处理约 **532 token/s**，输出约 **208 token/s**。这不是从模型卡抄来的数字，而是 llama.cpp 返回的 timing。模型也已经通过 Codex 的真实 shell tool call，不只是能在网页里聊天。

这篇文章不再从装驱动开始逐个截图，而是把真正决定系统能不能用的配置、代码和坑集中写清楚。示例里的内网 IP、密钥和个人目录都换成了占位值，其他部分尽量保留原样。

## 先看成果

部署机的主要环境如下：

| 项目 | 实际环境 |
| --- | --- |
| GPU | NVIDIA GeForce RTX 5090，32 GB |
| 系统 | Windows 11 + Docker Desktop + WSL2 |
| CUDA | 13.3 |
| 编译器 | MSVC 19.32 |
| CMake | 4.4 |
| llama.cpp | Windows 原生 CUDA 构建 |
| 模型 | Qwen3.5-35B-A3B Q4_K_M，约 20.5 GiB |
| 上下文 | 初次验收 32K，服务可按显存调整 |
| Web | Open WebUI |
| RAG | BGE-M3 + Qdrant + FastAPI |
| 工具 | Python、MATLAB、OpenFOAM、Aspen Plus、Fluent |
| Agent 客户端 | 每位成员自己的 Codex |

初次 API 验收数据：

```text
prompt_tokens:       53
completion_tokens:  231
prompt processing:  531.98 token/s
generation:         207.77 token/s
generation time:    1.112 s
finish_reason:      stop
```

这是一个短请求，因此不能代表所有上下文长度和并发条件。它至少说明模型没有掉进 CPU，也超过了我给单会话设定的 160 token/s 验收线。正式压测还应该覆盖 1/2/4 并发和 4K/16K/32K/64K 输入，记录 TTFT、P50/P95、错误率和显存峰值。

## 整套系统长什么样

```text
成员电脑 Codex
    |
    | Responses API + 用户密钥
    v
LiteLLM :8300  ----------> llama.cpp :8000
    |                         Qwen3.5-35B-A3B Q4_K_M
    |
    +--> Open WebUI :3000
    |
    +--> RAG Gateway :8100 --> Qdrant :6333 + BGE-M3
    |
    +--> Tool API :8200 --> pending_approval
                              |
                              +--> 老师 Y/N 审批
                                      |
                                      +--> 服务器 Worker
                                      |      MATLAB / Python / Aspen / Fluent
                                      |      OpenFOAM in WSL2
                                      |
                                      +--> 成员电脑出站 Worker
                                             成员本地已授权软件
```

这里有一条边界贯穿整个设计：**模型负责理解和规划，专业软件负责计算，人负责批准执行。** 我没有给模型一个万能 shell，再期待它“自觉”不做危险操作。

## 1. Windows 原生编译 llama.cpp

RTX 5090 是 Blackwell 架构，旧 CUDA 或旧构建链经常会在这里翻车。我最后使用 CUDA 13.3，在 Developer PowerShell for VS 2022 中编译：

```powershell
New-Item -ItemType Directory -Force -Path "C:\app" | Out-Null
git clone https://github.com/ggml-org/llama.cpp.git "C:\app\llama.cpp"
Set-Location "C:\app\llama.cpp"

git submodule update --init --recursive

cmake -S . -B build `
  -G "Visual Studio 17 2022" `
  -A x64 `
  -DGGML_CUDA=ON `
  -DCMAKE_CUDA_ARCHITECTURES=120

cmake --build build --config Release --parallel

& ".\build\bin\Release\llama-server.exe" --version
```

成功的 CMake 日志里应该能看到：

```text
Found CUDAToolkit ... v13.3
Replacing 120 in CMAKE_CUDA_ARCHITECTURES with 120a
Including CUDA backend
Configuring done
Generating done
```

Windows 下的 `pthread not found`、单卡环境里的 `NCCL not found`、没有安装 ccache，都不是阻塞项。真正需要停下来处理的是 CUDA backend 没有启用、架构 120 不受支持，或者运行时出现 `no kernel image`。

## 2. 下载并锁定 Qwen3.5-35B-A3B

我使用的是 Unsloth 发布的 Q4_K_M GGUF。模型仓库可以换，但 revision 和哈希一定要锁定，不能每次跟着 `main` 漂。

```powershell
$Root = "D:\chem-llm"
$ModelDir = "$Root\models\qwen3.5-35b-a3b-q4"
$Revision = "bc014a17be43adabd7066b7a86075ff935c6a4e2"

New-Item -ItemType Directory -Force -Path $ModelDir | Out-Null

uv tool install "huggingface_hub[cli]"

hf download unsloth/Qwen3.5-35B-A3B-GGUF `
  Qwen3.5-35B-A3B-Q4_K_M.gguf `
  mmproj-F16.gguf `
  --revision $Revision `
  --local-dir $ModelDir

Get-ChildItem $ModelDir -File |
  Get-FileHash -Algorithm SHA256 |
  Sort-Object Path |
  ForEach-Object { "$($_.Hash) *$($_.Path)" } |
  Set-Content "$ModelDir\SHA256SUMS.txt" -Encoding utf8
```

`mmproj-F16.gguf` 是视觉投影文件，纯文本首次启动时可以不加载。主 GGUF 约 20.5 GiB，Q4_K_M 在 32 GB 显存上还能给 KV cache、CUDA workspace 和桌面占用留一些余量。Q5 不是不能跑，只是余量明显更紧。

## 3. 启动参数与真实吞吐

为了复现实测，我把服务先固定为单并发、32K context、Flash Attention 和 Q8 KV cache：

```powershell
$Root = "D:\chem-llm"
$Server = "C:\app\llama.cpp\build\bin\Release\llama-server.exe"
$Model = "$Root\models\qwen3.5-35b-a3b-q4\Qwen3.5-35B-A3B-Q4_K_M.gguf"

& $Server `
  --model $Model `
  --host 127.0.0.1 `
  --port 8000 `
  --n-gpu-layers 999 `
  --ctx-size 32768 `
  --parallel 1 `
  --cont-batching `
  --flash-attn on `
  --cache-type-k q8_0 `
  --cache-type-v q8_0 `
  --jinja `
  --metrics
```

另开一个 PowerShell 发中文请求。这里必须显式转 UTF-8 字节，尤其是 Windows PowerShell 5.1，否则模型收到的中文可能全部变成问号。

```powershell
$Body = @{
  model = "Qwen3.5-35B-A3B"
  messages = @(
    @{
      role = "system"
      content = "你是化工与环境科研助手。不得编造实验数据。"
    }
    @{
      role = "user"
      content = "请用中文解释 pH、碱度和电荷平衡的关系，控制在300字以内。"
    }
  )
  temperature = 0.2
  max_tokens = 512
  stream = $false
  chat_template_kwargs = @{
    enable_thinking = $false
  }
} | ConvertTo-Json -Depth 10

$BodyBytes = [Text.Encoding]::UTF8.GetBytes($Body)

$Result = Invoke-RestMethod `
  -Uri "http://127.0.0.1:8000/v1/chat/completions" `
  -Method Post `
  -ContentType "application/json; charset=utf-8" `
  -Body $BodyBytes

$Result.choices[0].message.content
$Result.timings | Format-List
```

上面的 532/208 token/s 就来自 `$Result.timings`。如果只剩十几 token/s，第一件事不是调线程，而是看启动日志和 `nvidia-smi`，确认有没有 CPU offload 或 Windows Sysmem Fallback。

## 4. Open WebUI、Qdrant 与 RAG

模型跑稳后，我用 Docker Desktop 起 Open WebUI 和 Qdrant。Open WebUI 容器通过 `host.docker.internal` 访问 Windows 原生 llama.cpp：

```powershell
docker volume create chem-open-webui

docker run -d `
  --name chem-open-webui `
  --restart unless-stopped `
  -p 127.0.0.1:3000:8080 `
  -e OPENAI_API_BASE_URL=http://host.docker.internal:8000/v1 `
  -e OPENAI_API_KEY=local-only `
  -v chem-open-webui:/app/backend/data `
  ghcr.io/open-webui/open-webui:main

docker run -d `
  --name chem-qdrant `
  --restart unless-stopped `
  -p 127.0.0.1:6333:6333 `
  -v chem-qdrant:/qdrant/storage `
  qdrant/qdrant:latest
```

![Qwen3.5-35B-A3B 已经进入 Open WebUI](/media/2026/07/qwen35-open-webui.png)

这里有个很常见的误区：把 Qdrant 跑起来，不等于基础模型自动会检索。直接在 WebUI 选择 Qwen，只会请求模型。我的做法是单独写一个 OpenAI 兼容的 RAG Gateway：

```text
POST /v1/chat/completions
    -> 对最后一条用户消息做 BGE-M3 embedding
    -> Qdrant 检索 top-k
    -> 拼接来源、页码和片段
    -> 调 llama.cpp
    -> 返回答案和 sources
```

一个最小检索核心大概是这样：

```python
from qdrant_client import QdrantClient
from sentence_transformers import SentenceTransformer

embedder = SentenceTransformer("BAAI/bge-m3", device="cpu")
qdrant = QdrantClient(url="http://127.0.0.1:6333")

def retrieve(question: str, limit: int = 6) -> list[dict]:
    vector = embedder.encode(
        question,
        normalize_embeddings=True,
    ).tolist()

    result = qdrant.query_points(
        collection_name="chem_corpus",
        query=vector,
        limit=limit,
        with_payload=True,
    )

    return [
        {
            "score": point.score,
            "text": point.payload.get("text", ""),
            "source": point.payload.get("source", ""),
            "page": point.payload.get("page"),
        }
        for point in result.points
    ]
```

PDF、Word、Markdown 和 OCR 文档入库时，我至少保存文档名、页码、块序号、文件哈希和解析方式。科研 RAG 如果只返回一段“听起来对”的话，却说不清来自哪份 SOP 的哪一页，实际价值很有限。

## 5. 五类软件如何接入

五种软件没有强行套同一个调用方式：

| 工具 | 实际接法 | 输入边界 |
| --- | --- | --- |
| Python 3.x | 批准脚本 + JSON 参数 | 不能提交任意 Python |
| MATLAB R2023b | 固定 `.m` 模板 + `-batch` | 参数范围由 registry 限制 |
| OpenFOAM 13 | WSL2 runner + 固定 case | solver、核数和 case 白名单 |
| Aspen Plus V12 | Windows COM + 已审核模型 | 不接受任意 COM 表达式 |
| Fluent 2021 R1 | Journal/TUI + 已审核 case | journal、模式和最大核数固定 |

工具 registry 的结构可以很朴素：

```json
{
  "tools": {
    "python.run_approved": {
      "templates": {
        "sine-analysis-v1": {
          "path": "D:/chem-agent/approved-scripts/sine_analysis.py",
          "parameters": {
            "points": { "type": "integer", "minimum": 10, "maximum": 100000 },
            "amplitude": { "type": "number", "minimum": -1000, "maximum": 1000 }
          }
        }
      }
    },
    "matlab.run_template": {
      "templates": {
        "sine-analysis-v1": {
          "path": "D:/chem-agent/templates/matlab/sine_analysis.m"
        }
      }
    },
    "openfoam.run_template": {
      "templates": {
        "cavity-v1": {
          "path": "/home/worker/chem-agent/templates/cavity-v1",
          "solver": "foamRun",
          "max_cores": 16
        }
      }
    }
  }
}
```

Agent 只能提交 `tool + template_id + parameters`，不能直接传可执行文件路径，更不能提交一整段 shell、MATLAB 或 Fluent TUI。

## 6. 为什么要做任务队列和 Y/N 审批

Tool API 把执行拆成五个状态：

```text
pending_approval
    -> approved / rejected
    -> running
    -> completed / failed
```

提交接口只创建任务，不执行：

```python
from typing import Any, Literal
from pydantic import BaseModel, Field

class JobRequest(BaseModel):
    tool: Literal[
        "python.run_approved",
        "matlab.run_template",
        "openfoam.run_template",
        "aspen.run_template",
        "fluent.run_journal",
    ]
    template_id: str = Field(min_length=1, max_length=80)
    parameters: dict[str, Any] = Field(default_factory=dict)
    target_worker: str
    reason: str = Field(min_length=1, max_length=500)

@app.post("/v1/jobs")
def create_job(request: JobRequest, agent=Depends(require_agent_key)):
    validated = registry.validate(
        request.tool,
        request.template_id,
        request.parameters,
    )
    return jobs.create(
        request=request,
        validated_parameters=validated,
        status="pending_approval",
    )
```

审批接口使用完全不同的密钥，而且不会出现在模型可见的 OpenAPI/MCP schema 里。老师看到工具、模板、参数、Worker、核数、超时和理由后，只输入 Y 或 N。模型能建议执行，但不能批准自己的建议。

Python 冒烟任务最后生成了 201 行数据和三份可校验产物：

```text
analysis.csv
analysis_status.json
params.json
```

服务器记录每个产物的相对路径、大小和 SHA256。MATLAB、OpenFOAM、Aspen 和 Fluent 也使用同一套任务状态和产物协议，只是 adapter 不同。

## 7. 成员电脑上的软件怎么跑

服务器主动连接每一台成员电脑不太现实。防火墙、动态 IP、Windows 账户和商业软件许可都会变复杂。所以我反过来让成员电脑运行出站 Worker：

```text
成员 Worker 轮询中央 API
    -> 只领取 target_worker 等于自己的 approved 任务
    -> 调本机白名单 adapter
    -> 产物保留在本机任务目录
    -> 回报状态、日志摘要和 SHA256
```

成员电脑不需要开放 MATLAB、Aspen、Fluent 或 Tool API 端口。每台机器只有唯一 Worker ID 和 token，服务器端再按机器配置允许的工具列表。

这条链路已经做过一次真实局域网验收：服务器批准一个 31 点、幅值 1.25 的 Python 正弦分析任务，成员电脑领取后生成 31 行 CSV，回报成功，中央任务状态变成 completed。

## 8. 把服务器模型接进 Codex

这部分比预想中绕。当前 llama.cpp 的 `/v1/responses` 不可用，而 Codex 的自定义 provider 走 Responses API。最终链路是：

```text
Codex /v1/responses
    -> LiteLLM
    -> llama.cpp /v1/chat/completions
```

LiteLLM 的关键配置：

```yaml
model_list:
  - model_name: Qwen3.5-35B-A3B
    litellm_params:
      model: openai/<LLAMA_CPP_MODEL_ID>
      api_base: http://host.docker.internal:8000/v1
      api_key: local-only
      use_chat_completions_api: true
      extra_body:
        chat_template_kwargs:
          enable_thinking: false

  - model_name: Qwen3.5-35B-A3B-Thinking
    litellm_params:
      model: openai/<LLAMA_CPP_MODEL_ID>
      api_base: http://host.docker.internal:8000/v1
      api_key: local-only
      use_chat_completions_api: true
      extra_body:
        chat_template_kwargs:
          enable_thinking: true

litellm_settings:
  drop_params: true

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
```

普通版和 Thinking 版共用同一份 GGUF，只是 chat template 参数不同。普通版更适合工具调用，Thinking 版适合需要长推演的任务。

成员 Windows 电脑的 Codex 配置：

```toml
[model_providers.chem_server]
name = "Chem LLM"
base_url = "http://<SERVER_LAN_IP>:8300/v1"
wire_api = "responses"
env_key = "CHEM_MODEL_API_KEY"
requires_openai_auth = false
```

然后用环境变量保存每位成员的 key，不把 key 写进 `config.toml`：

```powershell
[Environment]::SetEnvironmentVariable(
  "CHEM_MODEL_API_KEY",
  "<MEMBER_KEY>",
  "User"
)
```

![成员电脑上的 Codex 已经选择局域网 Qwen 模型](/media/2026/07/codex-lan-client.jpg)

验收时我没有停在“模型回答 OK”，而是要求远程模型生成 shell tool call，在成员电脑执行 `uname -s`，再把真实结果回传给模型。最终得到：

```text
CHEM_CODEX_SHELL_OK:Linux
```

这才算 Agent 链路跑通。

## 9. Qwen 和 Codex 之间的两个坑

### 多个 system 消息

Codex 会同时发送 instructions 和 developer 消息。LiteLLM 转成 Chat Completions 后，可能得到多个 system 消息。Qwen3.5 的 chat template 要求 system 只能出现在最前面，于是报错：

```text
System message must be at the beginning
```

临时修复是在 LiteLLM pre-call hook 里合并 system 消息：

```python
from typing import Any
from litellm.integrations.custom_logger import CustomLogger

class MergeSystemMessages(CustomLogger):
    @staticmethod
    def extract_text(content: Any) -> str:
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            return "\n\n".join(
                block.get("text", "")
                for block in content
                if isinstance(block, dict)
                and block.get("type") in ("text", "input_text")
                and block.get("text")
            )
        return ""

    def merge_responses(self, data: dict) -> dict:
        input_items = data.get("input") or []
        if not isinstance(input_items, list):
            return data

        system_parts = []
        remaining = []
        for item in input_items:
            if isinstance(item, dict) and item.get("role") in ("developer", "system"):
                text = self.extract_text(item.get("content", ""))
                if text:
                    system_parts.append(text)
            else:
                remaining.append(item)

        if system_parts:
            instructions = data.get("instructions") or ""
            if instructions:
                system_parts.insert(0, instructions)
            data["instructions"] = "\n\n".join(system_parts)
            data["input"] = remaining
        return data

    def merge_completion(self, data: dict) -> dict:
        messages = data.get("messages")
        if not isinstance(messages, list):
            return data

        system_parts = []
        remaining = []
        for message in messages:
            if isinstance(message, dict) and message.get("role") == "system":
                text = self.extract_text(message.get("content", ""))
                if text:
                    system_parts.append(text)
            else:
                remaining.append(message)

        if len(system_parts) > 1:
            data["messages"] = [
                {"role": "system", "content": "\n\n".join(system_parts)},
                *remaining,
            ]
        return data

    async def async_pre_call_hook(
        self,
        user_api_key_dict,
        cache,
        data: dict,
        call_type: str,
    ):
        if call_type in ("aresponses", "responses"):
            return self.merge_responses(data)
        if call_type in ("completion", "acompletion"):
            return self.merge_completion(data)
        return data

merge_system_messages_hook = MergeSystemMessages()
```

把文件保存为 `merge_system_messages.py`，再在 LiteLLM 配置中注册并挂进容器：

```yaml
litellm_settings:
  callbacks:
    - merge_system_messages.merge_system_messages_hook
  drop_params: true
```

```powershell
docker run ... `
  -v "D:\chem-llm\config\merge_system_messages.py:/app/merge_system_messages.py:ro" `
  ...
```

### `No connected db` 不一定是数据库坏了

LiteLLM 配置 master key 但没有数据库时，客户端传错 key，某些版本会把它当作 virtual key 去数据库查询，最后返回：

```text
No connected db
```

实际先检查 key 是否完整，特别是有没有把 `LITELLM_MASTER_KEY=` 前缀、引号或空格也复制进去。不要打印 key，可以比较长度和高熵 SHA256 指纹。

## 10. 端口怎么分

这台机器现在有六个主要服务端口：

| 端口 | 服务 | 对局域网 |
| ---: | --- | --- |
| 3000 | Open WebUI | 可选开放 |
| 6333 | Qdrant | 只监听本机 |
| 8000 | llama.cpp | 只监听本机 |
| 8100 | RAG Gateway | 默认只监听本机 |
| 8200 | Tool API | 只允许已注册 Worker |
| 8300 | LiteLLM / Codex 模型网关 | 只允许授权成员 |

Docker 内部的 8080 和 4000 不需要在 Windows 防火墙再开一遍。模型端口 8000 也不直接暴露给成员，所有成员统一走 8300 的认证网关。

## 11. 目前做到什么程度

已经完成的闭环包括：

- Qwen3.5-35B-A3B Q4_K_M 在 RTX 5090 上全 GPU 推理；
- 32K 单并发实测约 532 token/s 输入、208 token/s 输出；
- Open WebUI 可用；
- PDF、Word、OCR 文档可入 Qdrant；
- RAG API 能返回来源信息；
- Python、MATLAB、OpenFOAM、Aspen Plus、Fluent 五类工具进入同一任务 API；
- 任务必须经过 Y/N 人工审批；
- 成员电脑的出站 Worker 已跑通真实任务；
- Codex 能通过 LiteLLM 使用服务器模型；
- 普通版和 Thinking 版模型别名都通过验证；
- 远程模型生成 Codex shell tool call 并完成结果回传。

还需要继续做的不是“再装一个模型”，而是生产化：LiteLLM 接数据库后给每人独立 virtual key，给局域网入口加 HTTPS 和内网 DNS，扩展并发压测，完善金标集回归，并把 Chem Tools 做成只暴露提交和查询能力的 MCP server。

## 最后

这次最大的感受是，本地模型真正难的部分不是把 GGUF 加载进显存。难的是让模型、知识库、专业软件、成员电脑和权限体系一起工作，还能说清楚每一步发生了什么。

208 token/s 很直观，但我更看重另外两个结果：模型不能自己批准软件任务，任何计算结果都能追到模板、日志和产物；成员也不必把实验数据和商业软件接口全部交给一台中央服务器。

这才是我理解的“本地化学科研 Agent”。
