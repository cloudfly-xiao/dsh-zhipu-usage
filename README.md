# dsh-zhipu-usage

DSH（DeepSeek Harness）Web GUI 的智谱 GLM Coding Plan 用量统计插件：侧边栏「智谱用量」入口 + 深空控制台风格用量面板，数据来自智谱开放平台官方接口（API key 配额 + 控制台登录令牌），全账号口径、覆盖所有设备。

## 功能

### 面板（深空玻璃拟态 / 青蓝科技配色）

- **摘要卡片**：今日 / 近7天 / 本月 tokens，点击卡片即切换趋势区间（选中发光高亮，多日卡显示日均）
- **5 小时滚动额度条**：plan 等级 + 百分比 + 重置倒计时；≥80% 变橙、≥95% 变红；下方直接展示赠送/累计消费金额与搜索配额
- **用量趋势图**（SVG，官方口径五档区间：今日/昨日/近7天/近30天/本月）
  - 每个数据点圆点 + 数值标签（碰撞避让自动抽稀，峰值点青色发光标注）
  - X 轴刻度自适应抽稀（今日=小时、多日=日期），首尾必显不重叠
  - 鼠标悬停 / 触屏点按出明细气泡（日期 · 精确 tokens · 调用数）
  - 渐变面积 + 发光折线
- **区间汇总行**：切换区间后显示 合计 tokens · 调用次数 · 日均
- **模型明细表**：按用量降序 + 占比条形图，默认前 6 行、一键展开全部
- 移动端全屏 sheet（safe-area 适配、浏览器底部导航遮挡处理、触屏交互）

### 数据源（双通道）

| 通道 | 凭据 | 数据 |
|---|---|---|
| API key | env `ZHIPU_API_KEY`/`GLM_API_KEY` 或文件兜底 `~/.dsh/zhipu-usage-key`(0600) | plan、5h 滚动窗口、搜索配额、账户金额（key 即身份，无需登录） |
| 控制台令牌 | `bigmodel_token_production`（面板「更新令牌」弹窗粘贴） | 全账号绝对用量：五档区间 tokens/调用/按模型拆分（覆盖所有设备） |

- 每 60 秒轮询（页面隐藏暂停），5 分钟服务端缓存
- 令牌更新走**服务端校验**：先向智谱验证再落盘，无效令牌不覆盖现有可用令牌，成功即清缓存立即生效
- 所有路由仅 loopback 可访问

## 安装（本机 web profile）

1. 克隆并链接进 profile（本地开发模式）：

```bash
git clone https://github.com/cloudfly-xiao/dsh-zhipu-usage ~/projects/dsh/dsh-zhipu-usage
# ~/.dsh/profiles/web/package.json dependencies 加:
#   "dsh-zhipu-usage": "file:<克隆路径>"
ln -s ~/projects/dsh/dsh-zhipu-usage ~/.dsh/profiles/web/node_modules/dsh-zhipu-usage
```

2. 在 `~/.dsh/profiles/web/cordis.patch.yml` 注册：

```yaml
- insert:
    - id: zhipu-usage
      name: 'dsh-zhipu-usage'
```

3. 重启 dsh web，刷新浏览器，侧边栏出现「智谱用量」入口。

## 首次配置

1. **API key**（额度/金额数据）：`echo -n '你的key' > ~/.dsh/zhipu-usage-key && chmod 600 ~/.dsh/zhipu-usage-key`（或在 dsh 启动环境 export `ZHIPU_API_KEY`）
2. **控制台令牌**（全账号用量）：浏览器登录 [bigmodel.cn](https://open.bigmodel.cn) → F12 → 复制 cookie `bigmodel_token_production` 的值 → 面板右上「更新令牌」→ 粘贴 → 确认更新（自动从整段 cookie 串提取 JWT）

令牌为服务端会话型 JWT，通常有效数周；面板检测到过期时「更新令牌」按钮变红提醒。

## 架构（双包形态）

热挂载与 rc 版宿主的限制决定了双包形态：

- **本包 dsh-zhipu-usage**：`lib/index.js` 宿主半（webServer 路由 + 官方 API 拉取 + 令牌存储），`lib/client.js` 浏览器半（`window.__ModuleLoader__.load` 模块，纯 DOM 无 React）
- **dsh-zhipu-usage-host2**（伴生包）：长时运行宿主的缓存 bust 入口（entry-vN.js → index-vN.js 版本链），修改宿主半后 bump 版本号热加载

关键文件：

```
lib/index.js     宿主半：state-r2 路由、五档区间拉取、quota 探测、令牌校验/handoff
lib/client.js    浏览器半：面板 UI（卡片/趋势图/模型表/令牌弹窗）
lib/scan.mjs     纯 Node 会话日志扫描器（zstd 多帧解码，独立可测）
tests/           node tests/run-tests.cjs
```

## 测试

```bash
node tests/run-tests.cjs
```

## License

MIT
