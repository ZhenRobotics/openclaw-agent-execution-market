# 🚀 发布指南

**项目名称：** openclaw-agent-execution-market
**版本：** 0.1.0
**发布日期：** 2026-03-13

---

## ✅ 发布前检查清单

### 1. 代码准备

- [x] 项目已完成开发
- [x] 所有类型定义正确
- [x] 命名方案已确认
- [ ] 代码已构建成功
- [ ] 测试通过
- [ ] 文档完整

### 2. 配置文件

- [x] `package.json` - 包名正确
- [x] `clawhub.yaml` - ClawHub 配置
- [x] `README.md` - 项目文档
- [x] `LICENSE` - MIT 许可证
- [ ] `.gitignore` - 忽略文件配置
- [ ] `.npmignore` - npm 发布忽略配置

### 3. 版本控制

- [ ] Git 仓库已初始化
- [ ] 代码已提交
- [ ] GitHub 仓库已创建
- [ ] 代码已推送

---

## 📦 平台发布流程

### 1️⃣ GitHub 发布

#### 创建仓库

在 GitHub 上创建仓库：
- 仓库名：`openclaw-agent-execution-market`
- 描述：`The Intent Clearinghouse for Verifiable Agent Execution`
- 公开仓库
- 不要添加 README/LICENSE（本地已有）

#### 推送代码

```bash
# 进入项目目录
cd /home/justin/openclaw-agent-execution-market

# 初始化 Git（如果还未初始化）
git init

# 添加所有文件
git add .

# 首次提交
git commit -m "chore: initial release v0.1.0

- Complete agent execution market implementation
- Intent management system
- Solver registry and matching engine
- Cryptographic verification layer
- REST API + WebSocket events
- CLI tools
- TypeScript SDK
- Complete documentation
"

# 设置主分支
git branch -M main

# 添加远程仓库
git remote add origin https://github.com/ZhenRobotics/openclaw-agent-execution-market.git

# 推送代码
git push -u origin main
```

#### 创建 Release

```bash
# 在 GitHub 网页上创建 Release
# 或使用 GitHub CLI
gh release create v0.1.0 \
  --title "Agent Execution Market v0.1.0" \
  --notes "Initial release of the Intent Clearinghouse for Verifiable Agent Execution

## Features
- Intent-based execution model
- Competitive solver marketplace
- Cryptographic verification
- Real-time WebSocket events
- REST API (13 endpoints)
- TypeScript SDK
- CLI tools

## Installation
\`\`\`bash
npm install -g openclaw-agent-execution-market
\`\`\`

## Documentation
See README.md for complete documentation.
"
```

---

### 2️⃣ npm 发布

#### 准备工作

```bash
# 1. 登录 npm（如果还未登录）
npm login

# 2. 验证登录状态
npm whoami

# 3. 检查包名是否可用
npm view openclaw-agent-execution-market

# 4. 构建项目
npm run build

# 5. 验证构建产物
ls -la dist/

# 6. 测试本地安装
npm pack
npm install -g openclaw-agent-execution-market-0.1.0.tgz
aem --version
npm uninstall -g openclaw-agent-execution-market
```

#### 发布到 npm

```bash
# 发布（首次发布使用 public）
npm publish --access public

# 验证发布
npm view openclaw-agent-execution-market

# 测试安装
npm install -g openclaw-agent-execution-market
aem --help
```

#### npm 发布后验证

访问以下链接确认：
- npm 包页面: https://www.npmjs.com/package/openclaw-agent-execution-market
- 检查版本、描述、关键词是否正确
- 测试安装命令

---

### 3️⃣ ClawHub 发布

#### 准备配置文件

确认 `clawhub.yaml` 配置正确：

```yaml
name: agent-execution-market
display_name: "Agent Execution Market"
version: 0.1.0
ecosystem: openclaw
```

#### 发布方式（根据 ClawHub 平台要求）

**方式 A：使用 ClawHub CLI**
```bash
# 安装 ClawHub CLI（如果有）
npm install -g clawhub-cli

# 登录
clawhub login

# 发布
clawhub publish
```

**方式 B：Web 界面上传**
1. 登录 ClawHub 平台
2. 进入"发布包"页面
3. 上传 `clawhub.yaml` 或填写表单
4. 关联 npm 包：`openclaw-agent-execution-market`
5. 关联 GitHub 仓库：`ZhenRobotics/openclaw-agent-execution-market`
6. 提交审核/发布

**方式 C：GitHub Action 自动同步**
```yaml
# .github/workflows/publish-clawhub.yml
name: Publish to ClawHub
on:
  release:
    types: [published]
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Publish to ClawHub
        run: |
          # 使用 ClawHub API 或 CLI 发布
          # 需要 CLAWHUB_TOKEN
```

---

## 🔍 发布后验证

### GitHub 检查

- [ ] 仓库已公开可访问
- [ ] README 正常显示
- [ ] Release 已创建
- [ ] Topics/Tags 已添加：`agent-execution`, `marketplace`, `intent-based`

### npm 检查

- [ ] 包页面可访问
- [ ] 版本号正确 (0.1.0)
- [ ] 依赖列表正确
- [ ] 可以成功安装
- [ ] CLI 命令可用

### ClawHub 检查

- [ ] 包已显示在平台上
- [ ] 名称为 `agent-execution-market`
- [ ] 链接到 npm 和 GitHub 正确
- [ ] 分类正确（infrastructure/marketplace）

---

## 📊 发布命令速查

### 完整发布流程（一键脚本）

```bash
#!/bin/bash
# publish-all.sh - 发布到所有平台

set -e

echo "🚀 开始发布流程..."

# 1. 检查工作区状态
if [[ -n $(git status -s) ]]; then
  echo "❌ 工作区有未提交的更改，请先提交"
  exit 1
fi

# 2. 构建项目
echo "📦 构建项目..."
npm run build

# 3. 运行测试（如果有）
if npm run test --if-present; then
  echo "✅ 测试通过"
else
  echo "❌ 测试失败"
  exit 1
fi

# 4. 创建 Git Tag
VERSION=$(node -p "require('./package.json').version")
echo "🏷️  创建版本标签 v$VERSION"
git tag -a "v$VERSION" -m "Release v$VERSION"

# 5. 推送到 GitHub
echo "📤 推送到 GitHub..."
git push origin main
git push origin "v$VERSION"

# 6. 发布到 npm
echo "📦 发布到 npm..."
npm publish --access public

# 7. 发布到 ClawHub（根据实际 API 调整）
echo "🦅 发布到 ClawHub..."
# clawhub publish 或 API 调用

echo "✅ 发布完成！"
echo ""
echo "验证链接："
echo "  npm: https://www.npmjs.com/package/openclaw-agent-execution-market"
echo "  GitHub: https://github.com/ZhenRobotics/openclaw-agent-execution-market"
echo "  ClawHub: https://clawhub.ai/packages/agent-execution-market"
```

---

## 🛠️ 更新版本发布

### 版本号规范 (Semantic Versioning)

- **补丁版本** (0.1.x): Bug 修复
- **次版本** (0.x.0): 新功能，向后兼容
- **主版本** (x.0.0): 破坏性变更

### 更新发布流程

```bash
# 1. 更新版本号
npm version patch  # 0.1.0 -> 0.1.1
# 或
npm version minor  # 0.1.0 -> 0.2.0
# 或
npm version major  # 0.1.0 -> 1.0.0

# 2. 更新 CHANGELOG.md
# 手动添加变更记录

# 3. 提交变更
git add .
git commit -m "chore: release v0.1.1"

# 4. 推送并发布
git push origin main
git push --tags
npm publish

# 5. 创建 GitHub Release
gh release create v0.1.1 --generate-notes
```

---

## 📝 发布清单总结

### 首次发布

```bash
# ✅ 代码准备
npm run build
npm test

# ✅ Git 初始化
git init
git add .
git commit -m "chore: initial release v0.1.0"

# ✅ GitHub 发布
# 创建仓库：https://github.com/new
git remote add origin https://github.com/ZhenRobotics/openclaw-agent-execution-market.git
git push -u origin main

# ✅ npm 发布
npm login
npm publish --access public

# ✅ ClawHub 发布
# 使用 Web 界面或 CLI

# ✅ 验证
npm view openclaw-agent-execution-market
npm install -g openclaw-agent-execution-market
aem --version
```

---

## 🎯 下一步

发布完成后：

1. **添加 Badges 到 README**
   ```markdown
   [![npm version](https://badge.fury.io/js/openclaw-agent-execution-market.svg)](https://www.npmjs.com/package/openclaw-agent-execution-market)
   [![GitHub license](https://img.shields.io/github/license/ZhenRobotics/openclaw-agent-execution-market.svg)](LICENSE)
   [![GitHub stars](https://img.shields.io/github/stars/ZhenRobotics/openclaw-agent-execution-market.svg)](https://github.com/ZhenRobotics/openclaw-agent-execution-market/stargazers)
   ```

2. **设置 GitHub Actions CI/CD**
   - 自动构建
   - 自动测试
   - 自动发布

3. **创建文档站点**
   - GitHub Pages
   - 或使用 VitePress/Docusaurus

4. **推广**
   - 发布到社交媒体
   - 提交到 awesome lists
   - 撰写技术博客

---

**祝发布顺利！** 🎉
