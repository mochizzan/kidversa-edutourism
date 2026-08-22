// Layer boundary: core is the innermost layer and MUST NOT import from shared/
// or features/. Dependencies flow features -> shared -> core, one way only.
// Formatting helpers (formatDate/formatDateTime/formatFileSize/truncate) live in
// shared/utils and are imported from there directly — re-exporting them here
// would recreate the core -> shared reverse edge and make the graph cyclic.
export { cn } from './cn'
