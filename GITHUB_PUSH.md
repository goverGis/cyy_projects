# 推送到 GitHub

> 本仓库已做好推送准备：**无密钥入库**、`.env` 已被 `.gitignore` 忽略、调试残留已清理。
> 沙箱环境无法联网，以下命令请你在**本机终端**（项目根目录 `E:\就业\项目\trae`）执行。

## 0. 推送前已完成的检查（无需再改）
- ✅ 真实数据库密码只存在于本地 `api/.env`（已被忽略，不会上传）
- ✅ 高德 key 只存在于本地 `frontend/.env`（已被忽略）
- ✅ `config.py` 默认连接串为占位符 `postgres:postgres`，本地靠 `api/.env` 覆盖
- ✅ 调试残留 `_agg*.json` / `_items2.json` 已停止跟踪
- ✅ 已扫描 tracked 文件：无 `:postgresql@`、无硬编码高德 key、无非示例 `.env`

## 1. 在 GitHub 新建空仓库
到 https://github.com/new 创建一个**空仓库**（不要勾选 README / .gitignore / License），
得到仓库地址：`https://github.com/<你的用户名>/<仓库名>.git`

## 2. 本机执行（把 REMOTE 换成你的地址）
```bash
cd E:\就业\项目\trae

# 关联远程仓库
git remote add origin https://github.com/<你的用户名>/<仓库名>.git

# 统一主分支名并推送（共 16 个 commit）
git branch -M master
git push -u origin master
```

## 3. 换机 / 协作者克隆后，本地运行前需补 .env
```bash
cp api/.env.example api/.env            # 填入你本机 PostgreSQL 的 postgres 用户密码
cp frontend/.env.example frontend/.env  # 填入你的高德 JSAPI key
```
然后双击 `run.bat`，或按开发文档启动前后端。

## 提交历史一览
`git log --oneline` 可见 16 个 commit，按 `feat` / `fix` / `chore` / `docs` / `test` / `opt` 分类，
信息为中文、语义清晰，适合作为简历作品集展示。

## 可选：忽略大文件 / 用 Git LFS
当前仓库无超大文件，直接 push 即可。若日后加入地图底图等二进制，再考虑 Git LFS。
