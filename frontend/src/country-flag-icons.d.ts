// Package mengekspor submodule string tanpa kondisi `types` pada exports map
// ("./string/3x2/<ISO>": "./string/3x2/<ISO>.js") sehingga resolusi TS tidak
// menemukan .d.ts per-flag. Ambient wildcard ini memberi tipe default-nya.
declare module 'country-flag-icons/string/3x2/*' {
  const svg: string
  export default svg
}
