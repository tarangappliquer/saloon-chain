// ui has no vite dependency of its own (only consuming apps do, which already get this via
// "types": ["vite/client"] in their own tsconfig) -- side-effect CSS imports here (LocationMap,
// UppyPhotoUploadModal) still need an ambient declaration when this package's own tsconfig.json is
// typechecked standalone (e.g. by an editor's TS server opening a file directly).
declare module '*.css';
