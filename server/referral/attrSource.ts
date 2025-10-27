export type AttrSource = 'cookie' | 'url' | 'body' | 'none';

export function chooseReferral({ cookieCode, urlCode, bodyCode }: { cookieCode: string | null; urlCode: string | null; bodyCode: string | null }): { source: AttrSource; code: string | null } {
  if (cookieCode) return { source: 'cookie', code: cookieCode };
  if (urlCode)    return { source: 'url', code: urlCode };
  if (bodyCode)   return { source: 'body', code: bodyCode };
  return { source: 'none', code: null };
}


