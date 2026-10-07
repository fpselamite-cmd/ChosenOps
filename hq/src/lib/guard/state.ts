/** While an admin previews the app as someone else, nothing may be written. The Firebase shims check this. */
let readOnly: string | null = null;
export const setReadOnly = (why: string | null) => {
  readOnly = why;
};
export const isReadOnly = () => readOnly;
export const blocked = () => Promise.reject(new Error(`Read-only: ${readOnly}`));
