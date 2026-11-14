package com.flexable.web.goalscenario;

import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.flexable.web.ai.GoalScenarioAiClient;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 목표 시나리오 유형 해설을 미리 만든다(#417, policies §7-6). 시세 수집 직후(MarketSyncJob)와 매시 10분에 돈다.
 * 매시 10분에는 이어서 기한(6~60개월)마다 안정·균형·적극 조합도 미리 만든다(#431, runPlans). 조합은 기한마다 AI를 한 번 불러 시간이 걸려 시세 수집 뒤에는 돌리지 않는다.
 * 지금 자료(상품·금리·통계·만기 경우)에 맞는 해설이 없을 때만 AI를 부르므로, 자료가 바뀐 날 말고는 호출이 없다.
 * 호출은 서비스 전체 하루 상한에만 세고 회원 횟수와 상관없다. 검사(ProposalText)를 통과한 칸만 저장한다.
 */
@Component
@Profile("worker")
public class GoalTypeRoleJob {
	private static final Logger log = LoggerFactory.getLogger(GoalTypeRoleJob.class);
	private static final JsonMapper JSON = JsonMapper.builder().build();

	/** made 새로 만든 수, kept 이미 있던 수, failed 실패·검사 탈락 수, capped 전체 상한에 걸려 멈췄는지. */
	public record Result(int made, int kept, int failed, boolean capped) {
	}

	private final GoalScenarioService service;
	private final GoalScenarioAiClient client;
	private final TypeRoleStore store;
	private final ScenarioAiQuota quota;
	private final GoalScenarioAiProperties aiProps;
	private final ScenarioPlanStore plans;

	GoalTypeRoleJob(GoalScenarioService service, GoalScenarioAiClient client, TypeRoleStore store, ScenarioAiQuota quota,
			GoalScenarioAiProperties aiProps, ScenarioPlanStore plans) {
		this.plans = plans;
		this.service = service;
		this.client = client;
		this.store = store;
		this.quota = quota;
		this.aiProps = aiProps;
	}

	@Scheduled(cron = "0 10 * * * *", zone = "Asia/Seoul")
	void scheduled() {
		try {
			runOnce();
		}
		catch (RuntimeException e) {
			log.warn("goal type roles failed: {}", e.getMessage());
		}
		try {
			runPlans();
		}
		catch (RuntimeException e) {
			log.warn("goal scenario plans failed: {}", e.getMessage());
		}
	}

	public synchronized Result runOnce() {
		if (!client.enabled() || client.typeRolePromptVersion() == null) {
			return new Result(0, 0, 0, false);
		}
		String version = client.typeRolePromptVersion();
		List<GoalScenarioService.TypeRoleTarget> targets = service.typeRoleTargets();
		int made = 0;
		int kept = 0;
		int failed = 0;
		boolean capped = false;
		for (GoalScenarioService.TypeRoleTarget target : targets) {
			TypeRoleSubject s = target.subject();
			if (store.touch(version, s.type(), s.fingerprint())) {
				kept++;
				continue;
			}
			// 상한에 닿은 뒤에도 남은 대상의 기존 해설은 확인 시각을 갱신해 지워지지 않게 한다(AI만 부르지 않는다)
			if (capped || !quota.reserveService()) {
				capped = true;
				continue;
			}
			try {
				GoalScenarioAiClient.Result r = client.typeRole(s.type().name(), s.json());
				TypeRoleStore.Role role = checked(s.type(), r.content(), target.facts());
				if (role == null) {
					failed++;
					continue;
				}
				store.save(version, s.type(), s.fingerprint(), role, r.model());
				made++;
			}
			catch (GoalScenarioAiClient.Failed e) {
				log.warn("goal type role AI failed: type={} reason={}", s.type(), e.reason());
				failed++;
			}
		}
		int deleted = store.deleteUnseen();
		// 숫자만 남긴다. 상품 이름·문구는 남기지 않는다(문구는 옵션을 켠 경우 지운 문장만)
		log.info("goal type roles: version={} targets={} made={} kept={} failed={} capped={} deleted={}", version, targets.size(), made, kept, failed,
				capped, deleted);
		return new Result(made, kept, failed, capped);
	}

	/**
	 * 기한마다 안정·균형·적극 조합을 미리 만든다(#431). 지금 자료에 맞는 조합이 있으면 확인 시각만 고치고, 없으면 이 기한의 유형 해설 다섯 개가 모두 있을 때
	 * AI를 한 번 불러 검사(Proposals.check: 개수·비중·단계 범위·문구)를 통과한 것만 저장한다. 해설이 아직 없으면 다음 실행으로 미룬다.
	 */
	public synchronized Result runPlans() {
		if (!client.enabled() || client.planPromptVersion() == null || client.typeRolePromptVersion() == null) {
			return new Result(0, 0, 0, false);
		}
		String version = client.planPromptVersion();
		String roleVersion = client.typeRolePromptVersion();
		List<GoalScenarioService.PlanTarget> targets = service.planTargets();
		int made = 0;
		int kept = 0;
		int failed = 0;
		boolean capped = false;
		for (GoalScenarioService.PlanTarget target : targets) {
			String fingerprint = target.subject().fingerprint();
			if (plans.touch(version, target.months(), fingerprint)) {
				kept++;
				continue;
			}
			Map<ProductType, TypeRoleStore.Role> roles = new java.util.EnumMap<>(ProductType.class);
			for (TypeRoleSubject r : target.roles()) {
				store.find(roleVersion, r.type(), r.fingerprint()).ifPresent(role -> roles.put(r.type(), role));
			}
			if (roles.size() < target.roles().size()) {
				failed++;
				continue;
			}
			if (capped || !quota.reserveService()) {
				capped = true;
				continue;
			}
			try {
				GoalScenarioAiClient.Result r = client.plan(JSON.writeValueAsString(target.subject().input()));
				List<Proposals.Draft> drafts = OpenAiScenarioProposer.parse(r.content(), roles);
				Proposals.Checked checked = Proposals.check(drafts, target.facts());
				if (checked.plans() == null) {
					log.warn("goal scenario plan rejected: months={} {}", target.months(), checked.logLine(aiProps.logRejected()));
					failed++;
					continue;
				}
				checked.removed().forEach(n -> log.warn("goal scenario plan sentence removed: months={} {}", target.months(), n.logLine(aiProps.logRejected())));
				plans.save(version, target.months(), fingerprint, drafts, r.model());
				made++;
			}
			catch (GoalScenarioAiClient.Failed | ScenarioProposer.Failed e) {
				log.warn("goal scenario plan AI failed: months={} reason={}", target.months(), e instanceof GoalScenarioAiClient.Failed f ? f.reason() : e.getMessage());
				failed++;
			}
		}
		int deleted = plans.deleteUnseen();
		// 숫자만 남긴다. 문구는 남기지 않는다(옵션을 켠 경우 걸린 문구만)
		log.info("goal scenario plans: version={} targets={} made={} kept={} failed={} capped={} deleted={}", version, targets.size(), made, kept, failed,
				capped, deleted);
		return new Result(made, kept, failed, capped);
	}

	/**
	 * 세 칸을 검사해 걸린 문장만 지운다. 넣은 이유·근거가 비거나, 근거에 비중 자리가 정확히 한 번 남지 않으면 저장하지 않는다(다음 실행에서 다시 만든다).
	 * 전망이 다 지워지면 빈 칸으로 저장한다.
	 */
	TypeRoleStore.Role checked(ProductType type, String content, ProposalText.Facts facts) {
		JsonNode root;
		try {
			root = JSON.readTree(content);
		}
		catch (RuntimeException e) {
			log.warn("goal type role rejected: type={} problem=BAD_RESPONSE", type);
			return null;
		}
		Map<String, String> out = new java.util.LinkedHashMap<>();
		for (String field : GoalScenarioAiClient.TYPE_ROLE_FIELDS) {
			JsonNode v = root.path(field);
			String text = v.isString() ? v.asString().replaceAll("\\s*\\n\\s*", " ").strip() : "";
			ProposalText.Cleaned cleaned = ProposalText.clean(text, facts, List.of());
			for (ProposalText.Removed removed : cleaned.removed()) {
				log.warn("goal type role sentence removed: {} {}.{}{}", removed.problem(), type, field, quoted(removed.sentence()));
			}
			out.put(field, cleaned.text().strip());
		}
		String basis = out.get("basis");
		int weights = basis.split(java.util.regex.Pattern.quote(TypeRoleStore.WEIGHT), -1).length - 1;
		if (out.get("reason").isEmpty() || basis.isEmpty() || weights != 1) {
			log.warn("goal type role rejected: type={} problem={}", type, weights != 1 && !basis.isEmpty() ? "NO_WEIGHT" : "TEXT_EMPTY");
			return null;
		}
		return new TypeRoleStore.Role(out.get("reason"), basis, out.get("outlook"));
	}

	private String quoted(String sentence) {
		if (!aiProps.logRejected() || sentence == null || sentence.isBlank()) {
			return "";
		}
		String clean = sentence.replaceAll("\\p{Cntrl}", " ").strip();
		return " \"" + (clean.length() > Proposals.LOG_TEXT_MAX ? clean.substring(0, Proposals.LOG_TEXT_MAX) : clean) + "\"";
	}
}
