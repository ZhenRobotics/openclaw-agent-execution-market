#!/bin/bash

# =============================================================================
# 发布脚本 - openclaw-agent-execution-market
# =============================================================================
# 用途：自动化发布到 GitHub 和 npm
# 使用：./scripts/publish.sh [major|minor|patch]
# =============================================================================

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印函数
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# 检查参数
VERSION_TYPE=${1:-patch}

if [[ ! "$VERSION_TYPE" =~ ^(major|minor|patch)$ ]]; then
    print_error "Invalid version type: $VERSION_TYPE"
    echo "Usage: $0 [major|minor|patch]"
    exit 1
fi

print_info "发布类型: $VERSION_TYPE"

# =============================================================================
# 1. 预检查
# =============================================================================

print_info "执行发布前检查..."

# 检查是否在正确的目录
if [[ ! -f "package.json" ]]; then
    print_error "package.json not found. Please run from project root."
    exit 1
fi

# 检查工作区是否干净
if [[ -n $(git status -s) ]]; then
    print_warning "工作区有未提交的更改"
    git status -s
    read -p "是否继续？(y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_error "发布已取消"
        exit 1
    fi

    # 提交所有更改
    git add .
    git commit -m "chore: prepare for release"
fi

# 检查是否有未推送的提交
if [[ -n $(git log origin/main..HEAD 2>/dev/null) ]]; then
    print_warning "有未推送到远程的提交"
fi

# 检查 npm 登录状态
if ! npm whoami &>/dev/null; then
    print_error "未登录 npm，请先运行: npm login"
    exit 1
fi

print_success "预检查通过"

# =============================================================================
# 2. 构建项目
# =============================================================================

print_info "构建项目..."

# 清理旧的构建产物
rm -rf dist/

# 执行构建
if npm run build; then
    print_success "构建成功"
else
    print_error "构建失败"
    exit 1
fi

# 检查构建产物
if [[ ! -d "dist" ]] || [[ -z "$(ls -A dist)" ]]; then
    print_error "构建产物为空"
    exit 1
fi

print_success "构建产物已生成"

# =============================================================================
# 3. 运行测试
# =============================================================================

print_info "运行测试..."

if npm test --if-present; then
    print_success "测试通过"
else
    print_error "测试失败"
    exit 1
fi

# =============================================================================
# 4. 更新版本号
# =============================================================================

print_info "更新版本号..."

OLD_VERSION=$(node -p "require('./package.json').version")
npm version $VERSION_TYPE --no-git-tag-version
NEW_VERSION=$(node -p "require('./package.json').version")

print_success "版本更新: $OLD_VERSION → $NEW_VERSION"

# 更新 clawhub.yaml 中的版本号
if [[ -f "clawhub.yaml" ]]; then
    sed -i "s/version: .*/version: $NEW_VERSION/" clawhub.yaml
    print_success "已更新 clawhub.yaml 版本号"
fi

# =============================================================================
# 5. 生成 CHANGELOG
# =============================================================================

print_info "更新 CHANGELOG..."

CHANGELOG_ENTRY="
## [$NEW_VERSION] - $(date +%Y-%m-%d)

### Changed
- Version bump to $NEW_VERSION

"

if [[ -f "CHANGELOG.md" ]]; then
    # 在文件开头插入新条目（保留标题后）
    sed -i "/^# Changelog/a\\$CHANGELOG_ENTRY" CHANGELOG.md
else
    # 创建新的 CHANGELOG
    echo "# Changelog

All notable changes to this project will be documented in this file.

$CHANGELOG_ENTRY" > CHANGELOG.md
fi

print_success "CHANGELOG 已更新"

# =============================================================================
# 6. Git 提交和标签
# =============================================================================

print_info "创建 Git 提交和标签..."

git add package.json clawhub.yaml CHANGELOG.md
git commit -m "chore: release v$NEW_VERSION" --no-verify

git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

print_success "已创建 Git 标签: v$NEW_VERSION"

# =============================================================================
# 7. 推送到 GitHub
# =============================================================================

print_info "推送到 GitHub..."

if git push origin main && git push origin "v$NEW_VERSION"; then
    print_success "已推送到 GitHub"
else
    print_error "推送失败，可能需要手动推送"
fi

# =============================================================================
# 8. 发布到 npm
# =============================================================================

print_info "发布到 npm..."

# 显示将要发布的文件
echo ""
print_info "将要发布的文件："
npm pack --dry-run

echo ""
read -p "确认发布到 npm？(y/N) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    if npm publish --access public; then
        print_success "已发布到 npm"
    else
        print_error "npm 发布失败"
        exit 1
    fi
else
    print_warning "跳过 npm 发布"
fi

# =============================================================================
# 9. 完成
# =============================================================================

echo ""
echo "========================================="
print_success "发布完成！"
echo "========================================="
echo ""
print_info "版本: v$NEW_VERSION"
echo ""
print_info "验证链接："
echo "  📦 npm:    https://www.npmjs.com/package/openclaw-agent-execution-market"
echo "  🐙 GitHub: https://github.com/ZhenRobotics/openclaw-agent-execution-market"
echo "  🏷️  Tag:    https://github.com/ZhenRobotics/openclaw-agent-execution-market/releases/tag/v$NEW_VERSION"
echo ""
print_info "安装命令："
echo "  npm install -g openclaw-agent-execution-market"
echo ""
print_info "下一步："
echo "  1. 在 GitHub 上创建 Release (可选)"
echo "  2. 发布到 ClawHub 平台"
echo "  3. 更新文档和公告"
echo ""
