# PocketBase Notes

这个目录存放模板项目的 PocketBase 相关内容。

## 约定

- `pb_migrations` 是 schema 的唯一来源
- migration 只负责 schema 和必要的数据修复
- 演示数据单独放在 `seeds/`，通过 `seed.mts` 导入
- 前端记录类型通过 `pocketbase-typegen` 生成到 `frontend/src/types/pocketbase.generated.ts`

## 推荐工作流

1. 在 PocketBase Dashboard 调整 collection
2. 生成或补写 migration
3. 重启 PocketBase，让 migration 自动执行
4. 运行 `pnpm run typegen:pocketbase`
5. 根据新类型调整前端 store / views / components

## 相关命令

```bash
pnpm run typecheck:pocketbase
pnpm run typegen:pocketbase
pnpm run seed:pocketbase
```
