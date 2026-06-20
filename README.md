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

- `src/data.js`：初始演示数据，可继续增加产品、物料、BOM 和库存
- `src/storage.js`：浏览器 LocalStorage 数据保存、读取与重置
- `src/mrp.js`：独立 MRP 需求计算和状态规则
- `src/app.js`：页面、路由与本地交互
- `src/styles.css`：界面样式
- `tests/mrp.test.js`：计算逻辑测试

产品、物料、BOM、库存和订单模拟数据保存在当前浏览器的 LocalStorage 中，刷新页面后仍会保留。点击左侧底部的“重置演示数据”可恢复初始数据。数据不会上传到服务器或写入数据库。
