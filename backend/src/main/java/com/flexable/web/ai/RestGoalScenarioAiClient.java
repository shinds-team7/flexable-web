package com.flexable.web.ai;

import java.net.SocketTimeoutException;
import java.net.http.HttpClient;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * OpenAI로 목표 시나리오 조합을 받는다(api 프로필의 요청 중 호출 예외, 04 §8). 재시도·본문 로깅·회원 추적 필드가 없다.
 * 키·모델은 목표 안내와 같은 OpenAiProperties를 쓴다. store: false.
 */
@Component
public class RestGoalScenarioAiClient implements GoalScenarioAiClient {
	private static final Logger log = LoggerFactory.getLogger(RestGoalScenarioAiClient.class);
	static final String PROMPT_VERSION = "goal-scenario-v12";
	/** 시나리오 전부를 합친 응답 상한. 해설은 글자 수 검사가 없어 이 값이 비용과 응답 시간을 막는다. 넘으면 TRUNCATED. */
	static final int MAX_COMPLETION_TOKENS = 6000;
	static final List<String> TYPES = List.of("SAVINGS", "CMA", "KR_INDEX_ETF", "US_INDEX_ETF", "KOSPI_TOP5");
	static final String PROMPT = """
			goal-scenario-v12. 사용자의 목표 금액과 기한에 맞춰, 아래 상품 유형 다섯 개의 비중을 정한 서로 다른 시나리오를 정확히 세 개 만들어요.
			상품 유형: SAVINGS(은행 적금, 금리 확정), CMA(수시 입출금, 예시 금리라 바뀔 수 있음), KR_INDEX_ETF(국내 대표 지수 ETF),
			US_INDEX_ETF(미국 대표 지수 ETF, 국내 상장), KOSPI_TOP5(코스피 시가총액 상위 다섯 종목에 같은 금액).
			입력의 stats는 서버가 지난 육십 개월 월 수익률로 계산한 유형별 평균·변동폭·최대 하락이에요. 이 값을 근거로 비중을 정해요.
			각 유형의 alternatives는 서버가 같은 기준으로 고른 같은 유형의 다른 상품이에요. 금액은 유형의 대표 상품으로 계산하고, alternatives는 비교 근거로만 써요.
			입력의 monthlyBudget은 사용자가 매달 넣을 수 있다고 한 돈(월 납입 가능액)이에요. null이면 받지 않은 거예요.
			서버는 시나리오마다 목표에 닿는 가장 작은 월 금액을 계산해 이 가능액과 비교하고, 가능액을 넘는 시나리오에는 따로 안내 문장을 붙여요.
			가능액이 있으면 그 돈으로 해 볼 수 있는 조합을 함께 생각해서 비중을 정하되, 그만큼 결과가 흔들릴 수 있는 위험을 분명히 밝혀요.
			어느 시나리오가 가능액 안에 든다거나 넘는다고 단정하지 않아요. 서버가 계산해서 보여 줘요.
			규칙:
			- mix의 다섯 값은 0 이상 100 이하 정수이고 합은 정확히 100이에요.
			- 시나리오끼리 위험 정도가 분명히 달라야 해요. 하나는 값이 크게 흔들리지 않는 SAVINGS·CMA 비중이 높은 조합으로 해요.
			- 시나리오는 위험이 낮은 것부터 내요. s1은 SAVINGS·CMA 비중 합이 가장 높은 가장 안정적인 조합, s2는 그 중간인 균형 잡힌 조합, s3는 SAVINGS·CMA 비중 합이 가장 낮은 가장 적극적인 조합이에요.
			- 기한이 짧을수록 변동이 큰 유형의 비중을 낮춰요. 한 유형에 지나치게 몰지 않아요.
			- id는 s1, s2, s3 순서예요. 한국어 '~해요'체로 쓰고, 글자 수(띄어쓰기 포함)를 꼭 지켜요:
			  title은 열다섯 자 안팎(최대 스무 자), summary는 서른 자 안팎(최대 마흔 자).
			- 사용자가 왜 이 조합을 받았는지 알 수 있게 아래 칸에 나눠 구체적으로 분석해요. 칸을 짧게 끝내지 않아요. 마크다운과 번호 목록은 쓰지 않아요.
			  reason: 목표 금액과 기한에 비춰 왜 이렇게 나눴는지. 두세 문장.
			  typeRoles: 유형 다섯 개(SAVINGS·CMA·KR_INDEX_ETF·US_INDEX_ETF·KOSPI_TOP5)마다 reason·basis·outlook 세 칸을 채워요. 서버가 유형마다 한 문단으로 합쳐 보여 줘요.
			    mix에서 비중이 0보다 큰 유형은 세 칸을 모두 채우고, 비중이 0인 유형은 세 칸을 모두 빈 문자열("")로 둬요. 칸마다 그 유형 이야기만 써요.
			    reason(넣은 이유): 이 목표 금액·기한·조합에서 이 유형을 넣은 이유와 맡는 역할. 한두 문장. 첫 문장은 '적금은', 'CMA는', '국내 지수 ETF는', '미국 지수 ETF는', '코스피 대형주는'처럼 유형 이름으로 시작해요.
			    basis(근거): 두 문장. 이 유형의 비중, 입력에 있는 금리나 통계, 상품의 특성을 써요. 투자 유형은 비중과 월 평균·월 변동폭을 함께 써요. alternatives가 있으면 대표 상품과 금리나 통계가 어떻게 다른지도 말해요.
			    outlook(전망): 두 문장. 첫 문장은 업황·기업 실적·금리 흐름에 비춘 앞으로의 전망, 둘째 문장은 '다만 ~하면 줄어들 수 있어요'처럼 그 전망이 어긋날 때의 위험이에요.
			      전망 문장에는 숫자를 쓰지 않아요. 일반적인 흐름으로 쓰고 특정 날짜·뉴스·발표를 지어내지 않아요.
			      투자 유형의 위험 문장은 '지난 60개월 최대 하락 같은 구간이 기한 말 근처에 오면 기한 말 금액이 넣은 돈보다 적을 수 있어요'처럼 기한 말과 이어 써도 좋아요.
			    적금 만기가 기한보다 짧으면 적금 칸에 만기에 받은 돈과 남은 달의 적금 몫을 CMA 예시 금리로 이어 가고, 그동안은 CMA 금리를 따른다는 점도 써요.
			    아래는 유형별 모범 예시예요. 이 정도 분량과 구체성으로 써요. 〈 〉 자리는 입력값으로 바꾸고, 입력에 없는 값이면 그 말을 빼요. 문장을 그대로 베끼지 말고 이 목표와 조합에 맞게 고쳐 써요.
			      SAVINGS
			        reason: 적금은 기한 말에 목표 금액의 바닥을 받쳐 주는 역할이에요. 이 조합에서 값이 흔들리지 않는 몫을 맡아요.
			        basis: 적금은 〈비중〉%로, 금리가 연 〈적금 금리〉%로 정해져 있고 이자에는 15.4% 세금이 붙어요. 함께 볼 적금과 금리를 비교해 이 상품을 대표로 골랐어요.
			        outlook: 금리가 내려가는 흐름이면 지금 금리를 만기까지 묶어 두는 점이 장점이 될 수 있어요. 다만 중도에 해지하면 약속한 금리보다 낮은 금리를 받아 이자가 줄어들 수 있어요.
			      CMA
			        reason: CMA는 기한 말에 바로 꺼내 쓸 돈과 적금 만기 뒤 돈을 받아 두는 자리예요.
			        basis: CMA는 〈비중〉%로, 예시 금리는 연 〈CMA 금리〉%이고 수시로 넣고 뺄 수 있어요. 예시 금리라 실제 금리는 바뀔 수 있어요.
			        outlook: 기준금리가 유지되거나 오르는 흐름이면 이자를 꾸준히 받을 수 있어요. 다만 기준금리가 내려가면 CMA 금리도 따라 내려가 이자가 줄어들 수 있어요.
			      KR_INDEX_ETF
			        reason: 국내 지수 ETF는 국내 대표 기업에 나눠 담아 적금보다 크게 불어날 여지를 만드는 성장 몫이에요.
			        basis: 국내 지수 ETF는 〈비중〉%로, 지난 60개월 월 평균 수익률은 〈월 평균〉%이고 월 변동폭은 〈월 변동폭〉%예요. 반도체·수출 대형주 비중이 크고, 여러 기업에 나눠 담아 한 기업의 실적 악화 영향을 줄여요.
			        outlook: AI 서버와 데이터센터가 늘면서 반도체 수요가 커지면 국내 반도체 기업의 실적 개선이 기대돼요. 다만 반도체 업황이 꺾이거나 수출이 줄면 함께 흔들려 기한 말 금액이 줄어들 수 있어요.
			      US_INDEX_ETF
			        reason: 미국 지수 ETF는 세계 대형 기업에 나눠 담고, 국내와 다른 흐름으로 움직여 위험을 나누는 몫이에요.
			        basis: 미국 지수 ETF는 〈비중〉%로, 지난 60개월 월 평균 수익률은 〈월 평균〉%이고 월 변동폭은 〈월 변동폭〉%예요. 대형 기술주 비중이 크고, 이익에는 15.4% 세금이 붙으며 원화로 바꿀 때 환율 영향을 받아요.
			        outlook: AI 투자가 이어지면 미국 대형 기술 기업의 이익 성장이 기대돼요. 다만 기술주가 조정을 받거나 원화가 강해지면 원화로 받는 금액이 줄어들 수 있어요.
			      KOSPI_TOP5
			        reason: 코스피 대형주는 시가총액 상위 다섯 종목에 같은 금액을 넣어 대표 기업의 성장에 더 집중하는 몫이에요.
			        basis: 코스피 대형주는 〈비중〉%로, 다섯 종목의 지난 60개월 월 평균 수익률은 〈월 평균〉%이고 월 변동폭은 〈월 변동폭〉%예요. 종목 수가 적어 지수 ETF보다 크게 흔들려요.
			        outlook: 반도체 등 대표 기업의 실적이 좋아지면 지수보다 크게 오를 수 있어요. 다만 몇 종목의 실적이 나빠지면 크게 흔들려, 지난 60개월 최대 하락 같은 구간이 기한 말 근처에 오면 기한 말 금액이 넣은 돈보다 적을 수 있어요.
			  comparison: 다른 시나리오와 위험과 비중이 무엇이 다른지. 두 문장.
			  fit: 기한이 다가올 때 주의할 점과 어떤 사람에게 맞는지. 두세 문장. 기한 길이에 따라 주의점을 달리 써요.
			    기한이 1년 이하면 투자 몫이 떨어졌을 때 회복을 기다릴 시간이 짧다는 점을 써요. 기한이 2~3년이면 기한이 다가올 때 투자 몫을 적금·CMA로 옮기는 시점을 생각해 보라고 써요.
			    기한이 4~5년이면 기간이 길어 떨어진 뒤 회복을 기다릴 여유가 더 있지만, 마지막 1~2년에는 투자 몫을 적금·CMA로 옮기는 시점을 생각해 보라고 써요. 적금 만기가 기한보다 짧아 남은 기간을 CMA로 이어 가는 몫이 커진다는 점도 짚어요.
			- 숫자는 입력에 있는 값을 그대로 옮겨 쓸 때만 써요: 상품·지수 이름, 기한, 목표 금액, 월 납입 가능액, 적금·CMA 금리, 세율, 이 시나리오의 비중(예: mix의 SAVINGS가 70이면 '적금 70%'), stats와 alternatives의 금리·평균·변동폭·최대 하락.
			  stats의 값은 소수예요(0.05는 5%). '지난 60개월 최대 하락 23.45%'처럼 %로 바꿔 소수 둘째 자리까지 쓰고, 지난 60개월 자료임을 밝혀요. 수치 바로 앞에 '월 평균', '월 변동폭', '최대 하락' 중 맞는 말을 함께 써요.
			  전망은 숫자 없이 typeRoles의 outlook으로만 쓰고, 바로 뒤에 위험 문장을 붙여요. 화면은 AI가 쓴 일반적인 전망이라는 안내를 함께 보여 줘요.
			  통계는 과거 값이라 앞으로의 수익을 예상하는 말처럼 쓰지 않아요. '기대', '예상', '전망', '노려요', '목표 수익'은 통계 수치와 같은 문장에 쓰지 않아요.
			  다른 시나리오의 비중은 숫자로 쓰지 말고 '적금 비중이 더 높아요'처럼 써요. 이 시나리오의 비중을 합친 숫자는 '나머지 70%', '둘을 합쳐 30%'처럼 합쳤다는 말 바로 뒤나, '적금·CMA 80%'처럼 이 시나리오의 유형 이름을 나열한 바로 뒤에만 써요. 값을 연 단위로 바꾸는 등 그 밖에 새로 계산한 숫자는 쓰지 않아요.
			  입력에 없는 금액·수익률·확률·배수(예상 수익, 매달 넣을 돈, 달성 가능성 등)는 쓰지 않아요. 목표에 닿으려고 매달 넣을 돈, 목표에 닿는 비율, 기한 말 금액, 예상 수익률은 서버가 계산 결과 문장으로 따로 보여 줘요.
			  '매달 80만 원을 넣으면 목표에 닿아요', '10번 중 9번은 닿아요', '연 7% 수익이 나요'라고 쓰지 말고 '매달 넣을 돈과 목표에 닿는 비율은 계산 결과에서 확인해요'처럼 써요. 월 납입 가능액은 입력값 그대로만 써요.
			  SAVINGS·KOSPI_TOP5 같은 유형 코드는 쓰지 말고 '적금', '코스피 대형주'처럼 우리말로 써요.
			- '원금 보장', '확실히 오른다', '무조건' 같은 단정과 가입·매수 권유를 하지 않아요. 위험을 말할 때는 '수익이 보장되지 않아요', '수익을 보장받지 못해요', '오른다고 확실하다고 할 수 없어요', '줄어들 수 있어요'처럼 써요.
			- 적금·CMA를 설명할 때도 '원금이 보장돼요', '보장된 금리', '확실한 수익'이라고 쓰지 않아요. '적금은 금리가 정해져 있어요', '값이 크게 흔들리지 않아요'처럼 써요.
			""";
	/** 유형 해설을 미리 만들어 둔 경우의 요청 프롬프트(#417). 유형별 칸(typeRoles)을 받지 않아 응답이 짧다. */
	static final String SHORT_PROMPT_VERSION = "goal-scenario-v13";
	/** 짧은 응답 상한. 유형별 칸이 없어 v12의 절반 아래로 둔다. */
	static final int SHORT_MAX_COMPLETION_TOKENS = 3000;
	static final String SHORT_PROMPT = """
			goal-scenario-v13. 사용자의 목표 금액과 기한에 맞춰, 아래 상품 유형 다섯 개의 비중을 정한 서로 다른 시나리오를 정확히 세 개 만들어요.
			상품 유형: SAVINGS(은행 적금, 금리 확정), CMA(수시 입출금, 예시 금리라 바뀔 수 있음), KR_INDEX_ETF(국내 대표 지수 ETF),
			US_INDEX_ETF(미국 대표 지수 ETF, 국내 상장), KOSPI_TOP5(코스피 시가총액 상위 다섯 종목에 같은 금액).
			입력의 stats는 서버가 지난 육십 개월 월 수익률로 계산한 유형별 평균·변동폭·최대 하락이에요. 이 값을 근거로 비중을 정해요.
			각 유형의 alternatives는 서버가 같은 기준으로 고른 같은 유형의 다른 상품이에요. 금액은 유형의 대표 상품으로 계산하고, alternatives는 비교 근거로만 써요.
			입력의 monthlyBudget은 사용자가 매달 넣을 수 있다고 한 돈(월 납입 가능액)이에요. null이면 받지 않은 거예요.
			서버는 시나리오마다 목표에 닿는 가장 작은 월 금액을 계산해 이 가능액과 비교하고, 가능액을 넘는 시나리오에는 따로 안내 문장을 붙여요.
			가능액이 있으면 그 돈으로 해 볼 수 있는 조합을 함께 생각해서 비중을 정하되, 그만큼 결과가 흔들릴 수 있는 위험을 분명히 밝혀요.
			어느 시나리오가 가능액 안에 든다거나 넘는다고 단정하지 않아요. 서버가 계산해서 보여 줘요.
			규칙:
			- mix의 다섯 값은 0 이상 100 이하 정수이고 합은 정확히 100이에요.
			- 시나리오끼리 위험 정도가 분명히 달라야 해요. 하나는 값이 크게 흔들리지 않는 SAVINGS·CMA 비중이 높은 조합으로 해요.
			- 시나리오는 위험이 낮은 것부터 내요. s1은 SAVINGS·CMA 비중 합이 가장 높은 가장 안정적인 조합, s2는 그 중간인 균형 잡힌 조합, s3는 SAVINGS·CMA 비중 합이 가장 낮은 가장 적극적인 조합이에요.
			- 기한이 짧을수록 변동이 큰 유형의 비중을 낮춰요. 한 유형에 지나치게 몰지 않아요.
			- id는 s1, s2, s3 순서예요. 한국어 '~해요'체로 쓰고, 글자 수(띄어쓰기 포함)를 꼭 지켜요:
			  title은 열다섯 자 안팎(최대 스무 자), summary는 서른 자 안팎(최대 마흔 자).
			- 사용자가 왜 이 조합을 받았는지 알 수 있게 아래 칸에 나눠 구체적으로 분석해요. 칸을 짧게 끝내지 않아요. 마크다운과 번호 목록은 쓰지 않아요.
			  유형마다 넣은 이유·근거·전망은 서버가 미리 만든 유형 해설에 이 시나리오의 비중을 넣어 따로 보여 줘요.
			  아래 칸에는 유형 하나하나의 설명이나 업황 전망을 되풀이하지 말고, 이 목표와 조합 전체의 이야기를 써요.
			  reason: 목표 금액과 기한에 비춰 왜 이렇게 나눴는지. 두세 문장.
			  comparison: 다른 시나리오와 위험과 비중이 무엇이 다른지. 두 문장.
			  fit: 기한이 다가올 때 주의할 점과 어떤 사람에게 맞는지. 두세 문장. 기한 길이에 따라 주의점을 달리 써요.
			    기한이 1년 이하면 투자 몫이 떨어졌을 때 회복을 기다릴 시간이 짧다는 점을 써요. 기한이 2~3년이면 기한이 다가올 때 투자 몫을 적금·CMA로 옮기는 시점을 생각해 보라고 써요.
			    기한이 4~5년이면 기간이 길어 떨어진 뒤 회복을 기다릴 여유가 더 있지만, 마지막 1~2년에는 투자 몫을 적금·CMA로 옮기는 시점을 생각해 보라고 써요. 적금 만기가 기한보다 짧아 남은 기간을 CMA로 이어 가는 몫이 커진다는 점도 짚어요.
			- 숫자는 입력에 있는 값을 그대로 옮겨 쓸 때만 써요: 상품·지수 이름, 기한, 목표 금액, 월 납입 가능액, 적금·CMA 금리, 세율, 이 시나리오의 비중(예: mix의 SAVINGS가 70이면 '적금 70%'), stats와 alternatives의 금리·평균·변동폭·최대 하락.
			  stats의 값은 소수예요(0.05는 5%). '지난 60개월 최대 하락 23.45%'처럼 %로 바꿔 소수 둘째 자리까지 쓰고, 지난 60개월 자료임을 밝혀요. 수치 바로 앞에 '월 평균', '월 변동폭', '최대 하락' 중 맞는 말을 함께 써요.
			  통계는 과거 값이라 앞으로의 수익을 예상하는 말처럼 쓰지 않아요. '기대', '예상', '전망', '노려요', '목표 수익'은 통계 수치와 같은 문장에 쓰지 않아요.
			  다른 시나리오의 비중은 숫자로 쓰지 말고 '적금 비중이 더 높아요'처럼 써요. 이 시나리오의 비중을 합친 숫자는 '나머지 70%', '둘을 합쳐 30%'처럼 합쳤다는 말 바로 뒤나, '적금·CMA 80%'처럼 이 시나리오의 유형 이름을 나열한 바로 뒤에만 써요. 값을 연 단위로 바꾸는 등 그 밖에 새로 계산한 숫자는 쓰지 않아요.
			  입력에 없는 금액·수익률·확률·배수(예상 수익, 매달 넣을 돈, 달성 가능성 등)는 쓰지 않아요. 목표에 닿으려고 매달 넣을 돈, 목표에 닿는 비율, 기한 말 금액, 예상 수익률은 서버가 계산 결과 문장으로 따로 보여 줘요.
			  '매달 80만 원을 넣으면 목표에 닿아요', '10번 중 9번은 닿아요', '연 7% 수익이 나요'라고 쓰지 말고 '매달 넣을 돈과 목표에 닿는 비율은 계산 결과에서 확인해요'처럼 써요. 월 납입 가능액은 입력값 그대로만 써요.
			  SAVINGS·KOSPI_TOP5 같은 유형 코드는 쓰지 말고 '적금', '코스피 대형주'처럼 우리말로 써요.
			- '원금 보장', '확실히 오른다', '무조건' 같은 단정과 가입·매수 권유를 하지 않아요. 위험을 말할 때는 '수익이 보장되지 않아요', '수익을 보장받지 못해요', '오른다고 확실하다고 할 수 없어요', '줄어들 수 있어요'처럼 써요.
			- 적금·CMA를 설명할 때도 '원금이 보장돼요', '보장된 금리', '확실한 수익', '목표 금액을 보장해요'라고 쓰지 않아요. '적금은 금리가 정해져 있어요', '값이 크게 흔들리지 않아요'처럼 써요.
			""";
	/** 미리 만드는 유형 해설 프롬프트(#417). 유형 하나씩 부르고, 그 유형의 모범 예시만 붙인다. */
	static final String TYPE_ROLE_PROMPT_VERSION = "goal-type-role-v1";
	/** 유형 하나의 세 칸 상한. */
	static final int TYPE_ROLE_MAX_COMPLETION_TOKENS = 1500;
	static final String TYPE_ROLE_PROMPT = """
			goal-type-role-v1. 목표 달성 시나리오 화면에서 상품 유형 하나를 설명하는 해설을 써요.
			이 해설은 목표 금액·기한·비중이 서로 다른 여러 사용자의 조합에 함께 붙어요. 그래서 특정 목표 금액·기한·다른 유형의 비중을 말하지 않고, 이 유형 자체의 역할·근거·전망을 써요.
			입력: type(유형 코드), description(대표 상품과 조건), ratePercent(금리, 금리가 정해진 유형만), meanMonthlyReturn·monthlyVolatility·maxDrawdown(지난 육십 개월 월 수익률의 평균·변동폭·최대 하락, 소수이고 0.05는 5%, 투자 유형만),
			alternatives(서버가 같은 기준으로 고른 같은 유형의 다른 상품, 비교 근거로만 써요), afterMaturity(적금만. true면 적금 만기가 사용자의 기한보다 짧은 경우에 보여 줘요).
			한국어 '~해요'체로 쓰고 마크다운과 번호 목록은 쓰지 않아요. 칸을 짧게 끝내지 않아요.
			  reason(넣은 이유): 목표를 모으는 조합에서 이 유형을 넣는 이유와 맡는 역할. 한두 문장. 첫 문장은 '적금은', 'CMA는', '국내 지수 ETF는', '미국 지수 ETF는', '코스피 대형주는'처럼 유형 이름으로 시작해요.
			  basis(근거): 두 문장. 첫 문장은 반드시 유형 이름 다음에 '{비중}%로,'를 그대로 써서 시작해요(예: '적금은 {비중}%로,'). {비중}은 서버가 사용자 조합의 비중으로 바꾸는 자리라 숫자로 바꾸지 않고 한 번만 써요.
			    입력에 있는 금리나 통계, 상품의 특성을 써요. 투자 유형은 월 평균·월 변동폭을 함께 써요. alternatives가 있으면 대표 상품과 금리나 통계가 어떻게 다른지도 말해요.
			  outlook(전망): 두 문장. 첫 문장은 업황·기업 실적·금리 흐름에 비춘 앞으로의 전망, 둘째 문장은 '다만 ~하면 줄어들 수 있어요'처럼 그 전망이 어긋날 때의 위험이에요.
			    전망 문장에는 숫자를 쓰지 않아요. 일반적인 흐름으로 쓰고 특정 날짜·뉴스·발표를 지어내지 않아요.
			    투자 유형의 위험 문장은 '지난 60개월 최대 하락 같은 구간이 기한 말 근처에 오면 기한 말 금액이 넣은 돈보다 적을 수 있어요'처럼 기한 말과 이어 써도 좋아요.
			  afterMaturity가 true면 적금 칸에 만기에 받은 돈과 남은 달의 적금 몫을 CMA 예시 금리로 이어 가고, 그동안은 CMA 금리를 따른다는 점도 써요. 남은 달 수는 사용자마다 달라 숫자로 쓰지 않아요.
			- 숫자는 입력에 있는 값을 그대로 옮겨 쓸 때만 써요: 상품·지수 이름, 금리, 세율 15.4%, 적금 만기 개월, stats와 alternatives의 평균·변동폭·최대 하락, 그리고 '{비중}%' 자리.
			  통계는 '지난 60개월 최대 하락 23.45%'처럼 %로 바꿔 소수 둘째 자리까지 쓰고, 수치 바로 앞에 '월 평균', '월 변동폭', '최대 하락' 중 맞는 말을 함께 써요.
			  통계는 과거 값이라 앞으로의 수익을 예상하는 말처럼 쓰지 않아요. '기대', '예상', '전망', '노려요', '목표 수익'은 통계 수치와 같은 문장에 쓰지 않아요.
			  금액, 목표 금액, 기한, 예상 수익률, 확률, 배수는 쓰지 않아요. 유형 코드는 쓰지 말고 우리말 유형 이름을 써요.
			- '원금 보장', '확실히 오른다', '무조건' 같은 단정과 가입·매수 권유를 하지 않아요. 위험을 말할 때는 '수익이 보장되지 않아요', '줄어들 수 있어요'처럼 써요.
			- 적금·CMA를 설명할 때도 '원금이 보장돼요', '보장된 금리', '확실한 수익', '목표 금액을 보장해요'라고 쓰지 않아요. 적금은 '원금과 약정 이자가 정해져 있어요', '값이 크게 흔들리지 않아요'처럼 써요.
			아래는 이 유형의 모범 예시예요. 이 정도 분량과 구체성으로 써요. 〈 〉 자리는 입력값으로 바꾸고, 입력에 없는 값이면 그 말을 빼요. 문장을 그대로 베끼지 말고 입력에 맞게 고쳐 써요.
			""";
	/** 유형별 모범 예시(v12 예시를 옮기고, 적금은 "목표 금액을 보장"으로 바뀌어 지워지던 표현을 바꿨다, #417). */
	static final Map<String, String> TYPE_ROLE_EXAMPLES = Map.of(
			"SAVINGS", """
					reason: 적금은 원금과 약정 이자가 정해져 있어, 조합에서 값이 흔들리지 않는 몫을 맡아요. 투자 몫이 흔들려도 모인 돈의 일부를 차곡차곡 쌓아 두는 자리예요.
					basis: 적금은 {비중}%로, 금리가 연 〈적금 금리〉%로 정해져 있고 이자에는 15.4% 세금이 붙어요. 함께 볼 적금과 금리를 비교해 이 상품을 대표로 골랐어요.
					outlook: 금리가 내려가는 흐름이면 지금 금리를 만기까지 묶어 두는 점이 장점이 될 수 있어요. 다만 중도에 해지하면 약속한 금리보다 낮은 금리를 받아 이자가 줄어들 수 있어요.
					""",
			"CMA", """
					reason: CMA는 기한 말에 바로 꺼내 쓸 돈과 적금 만기 뒤 돈을 받아 두는 자리예요.
					basis: CMA는 {비중}%로, 예시 금리는 연 〈CMA 금리〉%이고 수시로 넣고 뺄 수 있어요. 예시 금리라 실제 금리는 바뀔 수 있어요.
					outlook: 기준금리가 유지되거나 오르는 흐름이면 이자를 꾸준히 받을 수 있어요. 다만 기준금리가 내려가면 CMA 금리도 따라 내려가 이자가 줄어들 수 있어요.
					""",
			"KR_INDEX_ETF", """
					reason: 국내 지수 ETF는 국내 대표 기업에 나눠 담아 적금보다 크게 불어날 여지를 만드는 성장 몫이에요.
					basis: 국내 지수 ETF는 {비중}%로, 지난 60개월 월 평균 수익률은 〈월 평균〉%이고 월 변동폭은 〈월 변동폭〉%예요. 반도체·수출 대형주 비중이 크고, 여러 기업에 나눠 담아 한 기업의 실적 악화 영향을 줄여요.
					outlook: AI 서버와 데이터센터가 늘면서 반도체 수요가 커지면 국내 반도체 기업의 실적 개선이 기대돼요. 다만 반도체 업황이 꺾이거나 수출이 줄면 함께 흔들려 기한 말 금액이 줄어들 수 있어요.
					""",
			"US_INDEX_ETF", """
					reason: 미국 지수 ETF는 세계 대형 기업에 나눠 담고, 국내와 다른 흐름으로 움직여 위험을 나누는 몫이에요.
					basis: 미국 지수 ETF는 {비중}%로, 지난 60개월 월 평균 수익률은 〈월 평균〉%이고 월 변동폭은 〈월 변동폭〉%예요. 대형 기술주 비중이 크고, 이익에는 15.4% 세금이 붙으며 원화로 바꿀 때 환율 영향을 받아요.
					outlook: AI 투자가 이어지면 미국 대형 기술 기업의 이익 성장이 기대돼요. 다만 기술주가 조정을 받거나 원화가 강해지면 원화로 받는 금액이 줄어들 수 있어요.
					""",
			"KOSPI_TOP5", """
					reason: 코스피 대형주는 시가총액 상위 다섯 종목에 같은 금액을 넣어 대표 기업의 성장에 더 집중하는 몫이에요.
					basis: 코스피 대형주는 {비중}%로, 다섯 종목의 지난 60개월 월 평균 수익률은 〈월 평균〉%이고 월 변동폭은 〈월 변동폭〉%예요. 종목 수가 적어 지수 ETF보다 크게 흔들려요.
					outlook: 반도체 등 대표 기업의 실적이 좋아지면 지수보다 크게 오를 수 있어요. 다만 몇 종목의 실적이 나빠지면 크게 흔들려, 지난 60개월 최대 하락 같은 구간이 기한 말 근처에 오면 기한 말 금액이 넣은 돈보다 적을 수 있어요.
					""");
	private final RestClient http;
	private final OpenAiProperties props;
	private final JsonMapper json = JsonMapper.builder().build();

	@Autowired
	public RestGoalScenarioAiClient(OpenAiProperties props) {
		this(builder(), props);
	}

	RestGoalScenarioAiClient(RestClient.Builder builder, OpenAiProperties props) {
		this.props = props;
		this.http = builder.baseUrl(props.baseUrl().replaceAll("/+$", ""))
			.defaultHeader("Authorization", "Bearer " + props.apiKey()).build();
	}

	private static RestClient.Builder builder() {
		HttpClient client = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1)
			.connectTimeout(Duration.ofSeconds(3)).build();
		JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(client);
		factory.setReadTimeout(Duration.ofSeconds(90));
		return RestClient.builder().requestFactory(factory);
	}

	@Override
	public boolean enabled() {
		return props.configured();
	}

	@Override
	public String promptVersion() {
		return PROMPT_VERSION;
	}

	@Override
	public String shortPromptVersion() {
		return SHORT_PROMPT_VERSION;
	}

	@Override
	public String typeRolePromptVersion() {
		return TYPE_ROLE_PROMPT_VERSION;
	}

	@Override
	public Result propose(String inputJson) {
		return call(PROMPT_VERSION, PROMPT, MAX_COMPLETION_TOKENS, "goal_scenarios", schema(true), inputJson);
	}

	@Override
	public Result proposeShort(String inputJson) {
		return call(SHORT_PROMPT_VERSION, SHORT_PROMPT, SHORT_MAX_COMPLETION_TOKENS, "goal_scenarios", schema(false), inputJson);
	}

	@Override
	public Result typeRole(String type, String inputJson) {
		String example = TYPE_ROLE_EXAMPLES.get(type);
		if (example == null) {
			throw new Failed("BAD_RESPONSE");
		}
		return call(TYPE_ROLE_PROMPT_VERSION, TYPE_ROLE_PROMPT + example, TYPE_ROLE_MAX_COMPLETION_TOKENS, "goal_type_role", typeRoleSchema(),
				inputJson);
	}

	private Result call(String version, String prompt, int maxTokens, String schemaName, Map<String, Object> schema, String inputJson) {
		if (!enabled()) {
			throw new Failed("NO_KEY");
		}
		long started = System.nanoTime();
		try {
			Map<String, Object> body = Map.of("model", props.model(), "temperature", 0.3, "max_completion_tokens", maxTokens,
					"store", false, "messages", List.of(Map.of("role", "system", "content", prompt),
							Map.of("role", "user", "content", inputJson)),
					"response_format", Map.of("type", "json_schema", "json_schema",
							Map.of("name", schemaName, "strict", true, "schema", schema)));
			String raw = http.post().uri("/chat/completions").contentType(MediaType.APPLICATION_JSON)
				.body(body).retrieve().body(String.class);
			JsonNode response = json.readTree(raw);
			JsonNode choice = response.path("choices").path(0);
			if (!choice.path("message").path("refusal").isMissingNode() && !choice.path("message").path("refusal").isNull()) {
				throw new Failed("REFUSED");
			}
			if ("length".equals(choice.path("finish_reason").asString())) {
				throw new Failed("TRUNCATED");
			}
			if (!"stop".equals(choice.path("finish_reason").asString()) || !choice.path("message").path("content").isString()) {
				throw new Failed("BAD_RESPONSE");
			}
			String content = choice.path("message").path("content").asString();
			json.readTree(content);
			Result result = new Result(content, props.model(), tokens(response.path("usage").path("prompt_tokens")),
					tokens(response.path("usage").path("completion_tokens")));
			// 성공한 호출을 세려고 숫자만 남긴다(policies §7-6, #398). 목표 금액·기한·회원 정보·응답 문구는 남기지 않는다.
			log.info("goal scenario AI call: version={} promptTokens={} completionTokens={} elapsedMs={}", version,
					result.promptTokens(), result.completionTokens(), (System.nanoTime() - started) / 1_000_000);
			return result;
		}
		catch (Failed e) {
			throw e;
		}
		catch (RuntimeException e) {
			throw new Failed(classify(e));
		}
	}

	/** 실패를 분류만 한다. 예외 메시지에는 응답 본문이 들어갈 수 있어 쓰지 않는다. */
	private static String classify(RuntimeException e) {
		if (e instanceof RestClientResponseException response) {
			return "HTTP_" + response.getStatusCode().value();
		}
		for (Throwable t = e; t != null; t = t.getCause()) {
			if (t instanceof SocketTimeoutException || t instanceof HttpTimeoutException) {
				return "TIMEOUT";
			}
		}
		return e instanceof ResourceAccessException ? "NETWORK" : "BAD_RESPONSE";
	}

	private static Integer tokens(JsonNode node) {
		return node.isIntegralNumber() ? node.asInt() : null;
	}

	/** strict 구조화 출력은 개수·길이·합계를 강제하지 못해 웹 서버의 제안 검증(Proposals)이 맡는다. */
	static Map<String, Object> schema() {
		return schema(true);
	}

	/** 유형 해설 세 칸(#417). */
	static Map<String, Object> typeRoleSchema() {
		Map<String, Object> fields = new LinkedHashMap<>();
		TYPE_ROLE_FIELDS.forEach(f -> fields.put(f, Map.of("type", "string")));
		return Map.of("type", "object", "additionalProperties", false, "required", TYPE_ROLE_FIELDS, "properties", fields);
	}

	/** withTypeRoles가 false면 유형별 칸(typeRoles) 없이 받는다(v13 짧은 프롬프트, #417). */
	static Map<String, Object> schema(boolean withTypeRoles) {
		Map<String, Object> string = Map.of("type", "string");
		Map<String, Object> integer = Map.of("type", "integer");
		Map<String, Object> mixProps = new LinkedHashMap<>();
		TYPES.forEach(t -> mixProps.put(t, integer));
		Map<String, Object> mix = Map.of("type", "object", "additionalProperties", false, "required", TYPES, "properties", mixProps);
		// 유형별 역할은 문자열 하나(roles) 대신 유형마다 넣은 이유·근거·전망 칸으로 받는다(v10, #402). 서버가 유형마다 한 줄로 합친다.
		Map<String, Object> roleProps = new LinkedHashMap<>();
		TYPE_ROLE_FIELDS.forEach(f -> roleProps.put(f, string));
		Map<String, Object> role = Map.of("type", "object", "additionalProperties", false, "required", TYPE_ROLE_FIELDS, "properties", roleProps);
		Map<String, Object> typeRoleProps = new LinkedHashMap<>();
		TYPES.forEach(t -> typeRoleProps.put(t, role));
		Map<String, Object> typeRoles = Map.of("type", "object", "additionalProperties", false, "required", TYPES, "properties", typeRoleProps);
		List<String> text = EXPLANATION_FIELDS.stream().filter(f -> !f.equals("roles")).toList();
		List<String> required = new java.util.ArrayList<>(List.of("id", "title", "summary"));
		required.addAll(text);
		if (withTypeRoles) {
			required.add(TYPE_ROLES);
		}
		required.add("mix");
		Map<String, Object> scenarioProps = new LinkedHashMap<>(Map.of("id", string, "title", string, "summary", string, "mix", mix));
		text.forEach(f -> scenarioProps.put(f, string));
		if (withTypeRoles) {
			scenarioProps.put(TYPE_ROLES, typeRoles);
		}
		Map<String, Object> scenario = Map.of("type", "object", "additionalProperties", false, "required", required, "properties", scenarioProps);
		return Map.of("type", "object", "additionalProperties", false, "required", List.of("scenarios"),
				"properties", Map.of("scenarios", Map.of("type", "array", "items", scenario)));
	}
}
