# MRP LITE V1 — 中文 BOM 缺料分析 Demo

一个无登录、无数据库的前端 Demo，用于验证“订单 → BOM 展开 → 库存对比 → 缺料分析”的底层逻辑。

## 启动

项目没有第三方运行依赖。在项目目录执行：

```powershell
python -m http.server 8080
```

然后访问 <http://localhost:8080>。

也可以在已安装 Node.js 与 Python 的环境中执行 `npm start`。运行逻辑测试：`npm test`。

## 代码结构

- `src/data.js`：本地演示数据，可继续增加产品、物料、BOM 和库存
- `src/mrp.js`：独立 MRP 需求计算和状态规则
- `src/app.js`：页面、路由与本地交互
- `src/styles.css`：界面样式
- `tests/mrp.test.js`：计算逻辑测试

刷新页面会恢复初始演示数据，不会写入数据库或浏览器永久存储。
