export const legalLinks = [
  ['legal-notice', 'Legal notice'],
  ['privacy-policy', 'Privacy policy'],
].flatMap(([name, label]) => {
  const href = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content;
  return href ? [{ href, label }] : [];
});
