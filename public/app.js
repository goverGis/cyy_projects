/**
 * ============================================
 * Todo 应用 - 前端逻辑
 * ============================================
 * 
 * 【JavaScript 原理讲解】
 * JavaScript 是一种运行在浏览器中的编程语言
 * 它让网页从"静态"变成"动态"
 * 
 * 【前后端通信原理】
 * 1. 浏览器（前端）通过 fetch API 发送 HTTP 请求
 * 2. 服务器（后端）接收请求，处理后返回响应
 * 3. 前端接收响应，更新页面
 * 
 * 【API 通信流程】
 * 前端 --fetch()--> 发送请求到服务器
 * 服务器 --处理请求--> 执行业务逻辑
 * 服务器 --返回 JSON 数据--> 响应给前端
 * 前端 --解析数据--> 更新 DOM（页面）
 */

// ========== 全局变量 ==========

// 获取页面上的 DOM 元素
// 【DOM 原理】DOM (Document Object Model) 是文档对象模型
// 通过 JavaScript 可以操作 HTML 元素
const todoForm = document.getElementById('todo-form');
const todoInput = document.getElementById('todo-input');
const todoList = document.getElementById('todo-list');
const emptyState = document.getElementById('empty-state');
const totalCount = document.getElementById('total-count');
const completedCount = document.getElementById('completed-count');

// ========== 数据存储 ==========

// 前端缓存的 todo 数据（从后端获取后保存到这里）
let todos = [];

// ========== API 调用函数 ==========

/**
 * 【原理讲解】Fetch API
 * fetch() 是浏览器内置的 HTTP 请求工具
 * 它返回一个 Promise（异步操作对象）
 * 
 * 使用方式：
 * fetch(url, options)
 *   .then(response => response.json())  // 解析响应
 *   .then(data => { ... })              // 使用数据
 *   .catch(error => { ... })            // 处理错误
 * 
 * async/await 是更现代的写法，让异步代码看起来像同步代码
 */

// 获取所有 Todo
async function fetchTodos() {
    try {
        // fetch 默认发送 GET 请求
        const response = await fetch('/api/todos');
        
        // 检查响应是否成功
        if (!response.ok) {
            throw new Error('获取数据失败');
        }
        
        // 解析 JSON 响应数据
        // JSON (JavaScript Object Notation) 是前后端数据交换的格式
        todos = await response.json();
        
        // 更新页面显示
        renderTodos();
    } catch (error) {
        console.error('获取 Todo 失败:', error);
        alert('获取数据失败，请刷新页面重试');
    }
}

// 创建新 Todo
async function createTodo(text) {
    try {
        // fetch 的第二个参数用于配置请求
        const response = await fetch('/api/todos', {
            method: 'POST',  // HTTP 方法：POST 表示创建
            headers: {
                'Content-Type': 'application/json'  // 告诉服务器发送的是 JSON 格式
            },
            // 将数据转换为 JSON 字符串发送
            body: JSON.stringify({ text })
        });
        
        if (!response.ok) {
            // 从响应中获取错误信息
            const errorData = await response.json();
            throw new Error(errorData.error || '创建失败');
        }
        
        // 获取新创建的 todo
        const newTodo = await response.json();
        
        // 添加到本地数组
        todos.push(newTodo);
        
        // 更新页面显示
        renderTodos();
    } catch (error) {
        console.error('创建 Todo 失败:', error);
        alert(error.message);
    }
}

// 删除 Todo
async function deleteTodo(id) {
    try {
        // DELETE 请求，URL 中包含要删除的资源 ID
        const response = await fetch(`/api/todos/${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('删除失败');
        }
        
        // 从本地数组中移除
        todos = todos.filter(todo => todo.id !== id);
        
        // 更新页面显示
        renderTodos();
    } catch (error) {
        console.error('删除 Todo 失败:', error);
        alert('删除失败，请重试');
    }
}

// ========== 页面渲染函数 ==========

/**
 * 将数据渲染到页面上
 * 【原理】数据驱动视图：当数据变化时，重新渲染页面
 */
function renderTodos() {
    // 清空列表
    todoList.innerHTML = '';
    
    // 如果没有待办事项，显示空状态
    if (todos.length === 0) {
        emptyState.classList.remove('hidden');
    } else {
        emptyState.classList.add('hidden');
    }
    
    // 使用 DocumentFragment 批量创建元素，提高性能
    const fragment = document.createDocumentFragment();
    
    // 遍历所有 todo 并创建列表项
    todos.forEach(todo => {
        // 创建列表项
        const li = document.createElement('li');
        li.className = `todo-item${todo.completed ? ' completed' : ''}`;
        li.dataset.id = todo.id;  // 存储 ID 到 data 属性
        
        // 创建复选框
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'todo-checkbox';
        checkbox.checked = todo.completed;
        // 复选框状态变化时更新
        checkbox.addEventListener('change', () => {
            toggleTodo(todo.id);
        });
        
        // 创建文本内容
        const span = document.createElement('span');
        span.className = 'todo-text';
        span.textContent = todo.text;
        
        // 创建删除按钮
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '删除';
        deleteBtn.addEventListener('click', () => {
            // 点击删除时调用删除 API
            if (confirm('确定要删除这个待办事项吗？')) {
                deleteTodo(todo.id);
            }
        });
        
        // 组合元素
        li.appendChild(checkbox);
        li.appendChild(span);
        li.appendChild(deleteBtn);
        
        fragment.appendChild(li);
    });
    
    // 将所有列表项添加到列表
    todoList.appendChild(fragment);
    
    // 更新统计信息
    updateStats();
}

/**
 * 更新统计信息
 */
function updateStats() {
    const total = todos.length;
    const completed = todos.filter(todo => todo.completed).length;
    
    totalCount.textContent = total;
    completedCount.textContent = completed;
}

/**
 * 切换 Todo 完成状态
 * 注意：这里使用前端临时更新，实际项目应该调用后端 API
 */
function toggleTodo(id) {
    const todo = todos.find(t => t.id === id);
    if (todo) {
        todo.completed = !todo.completed;
        renderTodos();
        
        // 在实际项目中，这里应该调用 API 更新后端数据
        // await fetch(`/api/todos/${id}`, { method: 'PUT', body: JSON.stringify(todo) });
    }
}

// ========== 事件监听 ==========

/**
 * 【事件驱动原理】
 * 前端通过"事件监听"来响应用户操作
 * addEventListener 用于监听特定事件（如点击、提交等）
 */

// 表单提交事件 - 添加新 Todo
todoForm.addEventListener('submit', async (e) => {
    // preventDefault() 阻止表单的默认提交行为
    // 默认行为会刷新页面，我们不希望这样
    e.preventDefault();
    
    // 获取输入框的值，并去除首尾空格
    const text = todoInput.value.trim();
    
    // 验证输入
    if (!text) {
        alert('请输入待办事项内容');
        return;
    }
    
    // 调用后端 API 创建 Todo
    await createTodo(text);
    
    // 清空输入框
    todoInput.value = '';
    
    // 让输入框保持焦点，方便连续输入
    todoInput.focus();
});

// ========== 初始化 ==========

/**
 * 页面加载完成后执行
 * 【生命周期原理】
 * 1. 浏览器加载 HTML
 * 2. 解析 DOM 结构
 * 3. 加载 CSS 样式
 * 4. 加载并执行 JavaScript
 * 5. 初始化应用（获取数据等）
 */

// DOMContentLoaded 事件在 DOM 完全加载后触发
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Todo 应用已启动');
    console.log('📡 正在从服务器获取数据...');
    
    // 页面加载时从服务器获取初始数据
    fetchTodos();
});
