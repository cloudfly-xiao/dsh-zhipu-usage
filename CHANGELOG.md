# Changelog

## 0.2.0 (2026-08-19)

- 用量趋势时间选择器扩展为五档：今日/昨日/近7天/近30天/本月（对齐官方控制台口径），
  图表与模型表随区间联动。
- 令牌管理重做：仅保留「更新令牌」按钮（移至面板顶部右侧），点击弹窗多行输入
  （自动从粘贴内容提取 JWT），服务端先校验再持久化（无效令牌不落盘、不清空现有
  可用令牌），成功后清空用量缓存立即生效。
- 移除面板文案中的「全账号/官方接口」等口径说明（顶部副标题、趋势标题、footer、
  悬停提示）。
- remote 报表 API key 增加文件兜底 ~/.dsh/zhipu-usage-key（0600），不再依赖 dsh
  启动环境变量。
- 清理历史版本文件（index-v1..v33、未引用的 scan-v*、entry-v1..v29）。

## 0.1.0 (2026-08-18)

- 首版：侧边栏「智谱用量」入口（位于工作区菜单上方），点击打开用量面板。
- 宿主侧扫描 ~/.dsh/sessions 会话日志（多帧 zstd：zstdcat 优先、fzstd 兜底；
  mtime+size 缓存），按 provider/model 聚合每次 LLM 调用的 token 用量。
- GET /api/dsh-zhipu-usage/state 输出今日/昨日/近7天/近30天/累计、每日趋势、
  按模型明细；仅限 loopback 访问。
- 持久台账 ~/.dsh/zhipu-usage-ledger.json：DSH 清理会话日志后历史不丢。
- 面板展示摘要卡片、近30天每日折线趋势图（SVG：网格线/面积/悬停与触屏点按明细气泡/峰值点）、按模型表格；入口行实时显示今日
  token 胶囊；系统提示词注册插件公告（announceToAgent=false 可关闭）。
- 双包形态：本包纯客户端（市场 shim 热挂载）+ dsh-zhipu-usage-host 伴生包
  热挂载宿主半（子路径 specifier 规避长时宿主的裸包名解析缓存问题）；重启
  后由 profile patch 层按包名加载宿主半，伴生包惰性。
- 控制台登录绑定：面板底部「绑定智谱账号」按钮打开经宿主反向代理的智谱真实登录页
  （支持滑块验证码/微信登录），所有响应流经宿主并捕获控制台 Cookie（明文存
  ~/.dsh/zhipu-usage-auth.json，权限 0600，可随时解绑删除）；绑后面板显示已绑定，
  /auth/probe 可用 Cookie 探测控制台 API（绝对用量接入用）。
- 移除登录绑定流程：查明控制台 API 直接接受 Bearer API key（用户指出无需绑
  定），相关按钮与凭证文件已删除。
- remote 增加账户报表（/api/biz/account/query-customer-account-report）：
  赠送额度/累计消费/今日消费（元），悬停额度行可见；key 即身份，无需登录。