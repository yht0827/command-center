// ontology의 wiki_doc은 `wiki/...` 접두사로 저장되지만, 사이트의 wiki 라우트는
// `wiki/` 디렉토리 하위 상대경로(접두사 없음)를 키로 사용한다. 두 표기를 한 쪽으로 통일.
export function normalizeWikiDoc(wikiDoc) {
  return wikiDoc.replace(/^wiki\//, '');
}
