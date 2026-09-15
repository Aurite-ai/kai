# MCP Packaging & Distribution - Test Guide

This guide helps reviewers verify the MCP server packaging changes before merging.

## Quick Summary

This PR sets up the MCP server (`apps/mcp`) for distribution as:
1. **npm package** - Self-contained bundle with templates
2. **Docker container** - Alpine-based image

Templates were changed from embedded strings to file-based for easier maintenance.

---

## Prerequisites

```bash
# Ensure dependencies are installed
pnpm install
```

---

## Test 1: Run Unit Tests

All existing tests should pass:

```bash
pnpm --filter @aurite-ai/kai test
```

Expected: **466 tests passing** (4 skipped)

---

## Test 2: Build the Bundle

```bash
pnpm --filter @aurite-ai/kai bundle
```

Expected output:
- `dist/kai-mcp.cjs` (~1.1 MB)
- `dist/kai-mcp.cjs.map` (~3.6 MB)
- `dist/templates/` directory with copilot configs, frameworks, knowledge-base

Verify templates were copied:
```bash
ls -la apps/mcp/dist/templates/
```

---

## Test 3: Test the Bundled Server

Start the bundled server and call `kai_initialize`:

```bash
# Create a test directory
mkdir -p /tmp/kai-test

# Call the initialize tool via JSON-RPC
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"kai_initialize","arguments":{"targetPath":"/tmp/kai-test"}},"id":1}' | node apps/mcp/dist/kai-mcp.cjs
```

Expected: JSON response showing files copied to `/tmp/kai-test/.claude/`

Verify files exist:
```bash
ls -la /tmp/kai-test/.claude/
# Should show: CLAUDE.md, settings.json, agents/, skills/, context/, plans/

cat /tmp/kai-test/.claude/CLAUDE.md | head -10
# Should show the Agent Orchestrator content
```

---

## Test 4: Test CLI Arguments

```bash
# Test --help
node apps/mcp/dist/kai-mcp.cjs --help
```

Expected: Help text showing usage, available tools, configuration, and MCP setup example.

```bash
# Test --version
node apps/mcp/dist/kai-mcp.cjs --version
```

Expected: `kai-mcp-server v0.1.0`

---

## Test 5: Test health_check Tool

```bash
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"health_check","arguments":{}},"id":1}' | node apps/mcp/dist/kai-mcp.cjs 2>/dev/null
```

Expected: JSON response with health check results

---

## Test 6: Build Docker Image (Optional)

If Docker is available (run from repo root):

```bash
docker build -t kai/mcp-test -f apps/mcp/Dockerfile .
```

Expected: Image builds successfully (~195 MB)

Test the Docker image:
```bash
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"health_check","arguments":{}},"id":1}' | docker run -i kai/mcp-test
```

---

## Test 7: Verify Package.json Changes

Check the package.json is configured correctly:

```bash
cat apps/mcp/package.json | grep -A 10 '"files"'
```

Expected:
```json
"files": [
  "dist/kai-mcp.cjs",
  "dist/kai-mcp.cjs.map",
  "dist/templates",
  "README.md"
],
```

Verify `@kai/vck-templates` dependency is removed:
```bash
cat apps/mcp/package.json | grep vck-templates
# Should return nothing
```

---

## Key Files Changed

| File | Change |
|------|--------|
| `apps/mcp/src/templates/index.ts` | **NEW** - File-based template access |
| `apps/mcp/templates/` | **NEW** - Copied from `packages/vck-templates/templates/` |
| `apps/mcp/scripts/bundle.ts` | Added template copying |
| `apps/mcp/package.json` | Removed vck-templates dep, added npm config |
| `apps/mcp/Dockerfile` | Simplified, uses local templates |
| `apps/mcp/src/tools/initialize.ts` | Uses local templates module |
| `apps/mcp/src/knowledge/surfacing/framework-copier.ts` | Uses local templates module |

---

## Potential Issues to Watch For

1. **Template path resolution** - The templates module uses `__dirname` (primary) or `process.argv[1]` (fallback) in bundled CJS mode. If templates aren't found, check the `KAI_TEMPLATES_DIR` env var.

2. **ESbuild warning** - You'll see a warning about `import.meta` not being available in CJS format. This is expected and handled by the code.

3. **Async template functions** - The template getters are now async. Any code that consumes them must use `await`.

---

## Cleanup

```bash
rm -rf /tmp/kai-test
docker rmi kai/mcp-test  # if Docker test was run
```

---

## Publishing to npm

### Prerequisites

1. **npm account** with access to the `@aurite-ai` organization on [npmjs.com](https://www.npmjs.com/settings/aurite-ai/packages)
2. **Login to npm**:
   ```bash
   npm login
   ```

### Publish Steps

1. **Ensure you're on the correct branch** (typically `main` after PR merge)

2. **Build the bundle** (this is also run by `prepublishOnly`):
   ```bash
   cd apps/mcp
   pnpm build && pnpm bundle
   ```

3. **Verify the package contents**:
   ```bash
   npm pack --dry-run
   ```
   This shows what files will be included. Should list:
   - `dist/kai-mcp.cjs`
   - `dist/kai-mcp.cjs.map`
   - `dist/templates/` (and contents)
   - `README.md`
   - `package.json`

4. **Publish to npm**:
   ```bash
   npm publish
   ```

   > **Note:** `--access public` is already configured via `publishConfig` in `package.json`, so no flag is needed.

### Version Bumping

Before publishing a new version:

```bash
# Patch version (0.1.0 -> 0.1.1)
npm version patch

# Minor version (0.1.0 -> 0.2.0)
npm version minor

# Major version (0.1.0 -> 1.0.0)
npm version major
```

This updates `package.json` and creates a git tag.

### Verify Publication

After publishing:

```bash
# Check the package exists
npm view @aurite-ai/kai

# Test CLI
npx @aurite-ai/kai --version
npx @aurite-ai/kai --help

# Test global installation
npm install -g @aurite-ai/kai
kai-mcp --version
kai-mcp --help
```

### Publishing to Docker Hub (Optional)

```bash
# Build with proper tag (from repo root)
docker build -t kai/mcp:0.1.0 -t kai/mcp:latest -f apps/mcp/Dockerfile .

# Login to Docker Hub
docker login

# Push
docker push kai/mcp:0.1.0
docker push kai/mcp:latest
```
