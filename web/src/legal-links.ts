export const legalLinks = [
  ['legal-notice', 'Legal notice'],
  ['privacy-policy', 'Privacy policy'],
].flatMap(([name, label]) => {
  const href = document.querySelector(`meta[name="${name}"]`)?.getAttribute('content');

  return href ? [{ href, label }] : [];
});
