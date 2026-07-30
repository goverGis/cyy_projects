/**
 * ============================================
 * 全栈 Todo 应用 - 后端服务器
 * ============================================
 * 
 * 【原理讲解】
 * 1. Express 是一个 Node.js 的 Web 框架，它让创建服务器变得简单
 * 2. 服务器的作用是：接收客户端（浏览器）的请求，处理后返回响应
 * 3. API (Application Programming Interface) 是前后端通信的约定
 */

// 第一步：引入 Express 框架
// require() 是 Node.js 的模块加载函数，类似前端的 import
const express = require('express');

// 第二步：创建 Express 应用实例
// 这相当于创建一个"服务器对象"，后续所有操作都在这个对象上进行
const app = express();

// 第三步：配置中间件
// 【原理】中间件是 Express 的核心概念，它是一些函数，会在请求到达路由之前被执行

// express.json() 是一个内置中间件，用于解析 JSON 格式的请求体
// 当客户端发送 { "text": "学习全栈" } 这样的数据时，它会自动解析成 JavaScript 对象
app.use(express.json());

// express.static() 是一个内置中间件，用于托管静态文件
// 它会把 public 目录下的文件（HTML、CSS、JS）直接提供给浏览器访问
// 比如浏览器访问 http://localhost:3000/ 时，会自动返回 public/index.html
app.use(express.static('public'));

// 第四步：模拟数据库
// 【原理】真正的项目会使用 MySQL、MongoDB 等数据库
// 这里用一个数组来模拟，方便教学理解核心概念
// 每个 todo 对象包含：id（唯一标识）、text（内容）、completed（是否完成）
let todos = [
  { id: 1, text: '学习全栈开发', completed: false },
  { id: 2, text: '掌握 Node.js', completed: true },
  { id: 3, text: '理解前后端分离', completed: false }
];

// 用于生成新 ID 的计数器
let nextId = 4;

// 第五步：创建 API 路由
// 【原理】路由定义了"当浏览器请求某个地址时，服务器应该做什么"
// HTTP 方法：
// - GET：获取数据（读取）
// - POST：创建数据（新增）
// - PUT：更新数据（修改）
// - DELETE：删除数据

// API 1: 获取所有 Todo 列表
// 当浏览器发送 GET 请求到 /api/todos 时，返回所有待办事项
app.get('/api/todos', (req, res) => {
  // req (request)：请求对象，包含客户端传来的所有信息
  // res (response)：响应对象，用于向客户端返回数据
  
  // res.json() 会自动将 JavaScript 对象转换为 JSON 格式返回
  console.log('📥 收到请求：获取所有 Todo');
  res.json(todos);
});

// API 2: 创建新的 Todo
// 当浏览器发送 POST 请求到 /api/todos 时，创建一个新的待办事项
app.post('/api/todos', (req, res) => {
  // req.body 包含客户端发送的数据
  // 由于我们配置了 express.json()，所以可以直接获取 JSON 数据
  
  const text = req.body.text;
  
  // 数据验证：确保 text 存在且不为空
  if (!text || text.trim() === '') {
    // 返回 400 状态码表示"请求错误"
    return res.status(400).json({ error: '待办事项内容不能为空' });
  }
  
  // 创建新的 Todo 对象
  const newTodo = {
    id: nextId++,
    text: text.trim(),
    completed: false
  };
  
  // 添加到数组
  todos.push(newTodo);
  
  console.log('📥 收到请求：创建 Todo', newTodo);
  
  // 返回 201 状态码表示"创建成功"，并返回新创建的数据
  res.status(201).json(newTodo);
});

// API 3: 删除 Todo
// 当浏览器发送 DELETE 请求到 /api/todos/:id 时，删除对应的待办事项
// :id 是路由参数，表示 URL 中的动态部分
app.delete('/api/todos/:id', (req, res) => {
  // req.params 包含路由参数
  // parseInt 将字符串转换为数字
  const id = parseInt(req.params.id);
  
  // 查找要删除的 Todo 索引
  const index = todos.findIndex(todo => todo.id === id);
  
  // 如果找不到，返回 404 状态码表示"资源不存在"
  if (index === -1) {
    return res.status(404).json({ error: '未找到该 Todo' });
  }
  
  // 使用 splice 删除数组中的元素
  const deletedTodo = todos.splice(index, 1)[0];
  
  console.log('📥 收到请求：删除 Todo', deletedTodo);
  
  // 返回被删除的 Todo 数据
  res.json({ message: '删除成功', todo: deletedTodo });
});

// 第六步：启动服务器
// app.listen() 会让服务器在指定端口监听请求
// 3000 是端口号，浏览器通过 http://localhost:3000 访问
const PORT = 3000;
app.listen(PORT, () => {
  console.log('========================================');
  console.log('🚀 服务器已启动！');
  console.log(`📡 访问地址: http://localhost:${PORT}`);
  console.log('========================================');
  console.log('📝 API 接口:');
  console.log(`   GET    http://localhost:${PORT}/api/todos  - 获取所有待办`);
  console.log(`   POST   http://localhost:${PORT}/api/todos  - 创建新待办`);
  console.log(`   DELETE http://localhost:${PORT}/api/todos/:id - 删除待办`);
  console.log('========================================');
});
