// The server puts the operator's legal pages in the head. None are set by default.
export const legalLinks = [
  ['legal-notice', 'Legal notice'],
  ['privacy-policy', 'Privacy policy'],
].flatMap(([name, label]) => {
  const href = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content;
  return href ? [{ href, label }] : [];
});
