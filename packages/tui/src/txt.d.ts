/**
 * Bun natively imports .txt files as string modules (content embedded into
 * the bundle — and into compiled binaries via `bun build --compile`). The
 * bundled bun-types don't declare this, so declare it here.
 */
declare module "*.txt" {
  const content: string;
  export default content;
}
