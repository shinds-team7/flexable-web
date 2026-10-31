// 화면 타입(src/data/*.ts)이 계약(docs/contracts/web-api.yaml → npm run gen:api → api-schema.d.ts)과 맞는지 컴파일할 때 확인한다.
// 화면 타입은 판별 유니언·설명을 위해 손으로 쓴 것을 그대로 쓰고, 계약이 바뀌어 필드 이름·종류·null 여부가 어긋나면 npm run typecheck가 이 파일에서 실패한다.
// 실행 코드는 없다. 새 API를 화면에 붙이면 여기에도 한 줄을 더한다.
import type { AppLink, SeedEntry } from '@/data/appLink';
import type { Coach, GoalInput, GoalState } from '@/data/goal';
import type { SeedMoneyResponse } from '@/data/home';
import type { BoardListing, EventDetail, EventNews, IndexStrip, IndustryListing, PriceEvents, PriceSeries } from '@/data/market';
import type { YouthNews } from '@/data/news';
import type { CategoryResponse, Started } from '@/data/practice';
import type { DepositProduct, DepositProductDetail, DepositProductList, DepositSimulateRequest, DepositSimulation } from '@/data/deposit';
import type { SavingsProduct, SavingsProductDetail, SavingsProductList, SavingsSimulateRequest, SavingsSimulation } from '@/data/savings';
import type { components, paths } from './api-schema';

type S = components['schemas'];
type Json<T> = T extends { content: { 'application/json': infer B } } ? B : never;
type Ok<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends { responses: { 200: infer R } | { 201: infer R } } ? Json<R> : never;
type Body<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends { requestBody?: infer R } ? Json<NonNullable<R>> : never;

/** 서로 들어간다: 필드 이름·종류·null 여부가 같다 */
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Expect<T extends true> = T;
/** 계약 값이 화면 타입에 들어간다(화면 타입이 같거나 넓다): 응답을 화면 타입으로 받아도 안전하다 */
type Reads<Contract extends Screen, Screen> = [Contract, Screen];
/** 화면 타입이 계약에 들어간다: 판별 유니언처럼 화면 타입이 더 좁을 때. 필드가 빠지거나 이름이 바뀌면 실패한다 */
type Narrows<Screen extends Contract, Contract> = [Screen, Contract];

type LumpOnly = 'category' | 'depositProtected' | 'rateLimit';

export type ContractChecks = [
  // 시드머니·앱 연동
  Narrows<AppLink, S['AppLink']>,
  Narrows<SeedEntry, S['SeedEntry']>,
  Narrows<SeedMoneyResponse, S['SeedMoneyResponse']>,
  // 목표
  Narrows<GoalState, { goal: S['GoalView'] | null; ai: S['AiStatus'] }>,
  Narrows<Coach, S['Coach']>,
  Narrows<GoalInput, Body<'/me/goal', 'put'>>,
  // 투자 인사이트(#89). 화면은 POST /simulations/run을 부르지 않는다(API는 남음)
  Reads<S['BoardListing'], BoardListing>,
  Reads<S['EventDetail'], EventDetail>,
  Expect<Mutual<EventNews, Ok<'/market/events/{id}/news', 'get'>>>,
  Expect<Mutual<PriceSeries, Ok<'/market/instruments/{id}/prices', 'get'>>>,
  Expect<Mutual<PriceEvents, Ok<'/market/instruments/{id}/events', 'get'>>>,
  Expect<Mutual<IndexStrip, Ok<'/market/indices', 'get'>>>,
  Expect<Mutual<IndustryListing, Ok<'/market/industries', 'get'>>>,
  // 사건 퀴즈
  Expect<Mutual<CategoryResponse, Ok<'/practice/categories', 'get'>>>,
  Reads<Ok<'/practice/start', 'post'>, Started>,
  // 청년 소식
  // 지역은 화면에서 시·도 이름으로 좁혀 쓰므로 그 필드만 화면 타입으로 바꿔 대조한다
  Reads<Omit<S['YouthNewsItem'], 'regions'> & Pick<YouthNews, 'regions'>, YouthNews>,
  // 적금
  Reads<S['SavingsProduct'], SavingsProduct>,
  Reads<S['SavingsProductDetail'], SavingsProductDetail>,
  Reads<S['SavingsProductList'], SavingsProductList>,
  Expect<Mutual<SavingsSimulation, S['SavingsSimulation']>>,
  Narrows<SavingsSimulateRequest, Body<'/savings/simulate', 'post'>>,
  // 정기예금. 파킹·CMA 전용 필드(category·depositProtected·rateLimit)는 정기예금 계약에 없어 빼고 대조한다
  Reads<S['DepositProduct'], Omit<DepositProduct, LumpOnly>>,
  Reads<S['DepositProductDetail'], Omit<DepositProductDetail, LumpOnly>>,
  Reads<Omit<S['DepositProductList'], 'items'> & { items: S['DepositProduct'][] }, Omit<DepositProductList, 'items'> & { items: Omit<DepositProduct, LumpOnly>[] }>,
  Expect<Mutual<DepositSimulation, S['DepositSimulation']>>,
  Narrows<DepositSimulateRequest, Body<'/deposit/simulate', 'post'>>,
];
