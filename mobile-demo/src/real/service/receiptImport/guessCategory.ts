// 가맹점 이름으로 기본 카테고리 이름을 추정한다. 못 맞추면 "기타"·"기타 수입"으로 두고 검토 화면에서 고르게 한다.
const EXPENSE: [RegExp, string][] = [
  [
    /카페|커피|스타벅스|투썸|이디야|메가|빽다방|컴포즈|베이커리|빵|디저트/,
    "카페·간식",
  ],
  [
    /식당|김밥|치킨|피자|버거|맥도날드|배달|요기요|쿠팡이츠|국밥|분식|마라|한식|중식|일식/,
    "식비",
  ],
  [/택시|버스|지하철|교통|티머니|카카오T|주유|하이패스|KTX|SRT/, "교통"],
  [
    /CU|GS25|세븐일레븐|이마트|롯데마트|홈플러스|마트|다이소|올리브영/,
    "생활·마트",
  ],
  [/쿠팡|네이버쇼핑|무신사|지마켓|11번가|옥션|백화점|선물/, "쇼핑"],
  [/영화|CGV|메가박스|넷플릭스|유튜브|게임|노래방|공연/, "문화·여가"],
];
const INCOME: [RegExp, string][] = [
  [/급여|월급|상여/, "급여"],
  [/용돈/, "용돈"],
];
export function guessCategoryName(title: string, type: "EXPENSE" | "INCOME") {
  const rules = type === "EXPENSE" ? EXPENSE : INCOME;
  const hit = rules.find(([re]) => re.test(title));
  return hit ? hit[1] : type === "EXPENSE" ? "기타" : "기타 수입";
}
