package com.flexable.web.architecture;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.tngtech.archunit.core.domain.Dependency;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;

import jakarta.persistence.Entity;

/**
 * backend/README.md의 패키지 의존 표를 강제한다. 표를 고치면 이 ALLOWED도 같이 고친다.
 * common은 어떤 기능 패키지에도 의존하지 않으므로 모두가 쓸 수 있다.
 */
@AnalyzeClasses(packages = "com.flexable.web", importOptions = ImportOption.DoNotIncludeTests.class)
class PackageDependencyTest {

	private static final String ROOT = "com.flexable.web.";
	private static final String ALL = "*";

	static final Map<String, Set<String>> ALLOWED = Map.ofEntries(
			Map.entry("config", Set.of(ALL)),
			Map.entry("common", Set.of()),
			Map.entry("applink", Set.of("common")),
			Map.entry("auth", Set.of("user")),
			Map.entry("user", Set.of("applink")),
			Map.entry("seedmoney", Set.of("applink", "user")),
			Map.entry("market", Set.of("common")),
            Map.entry("practice", Set.of("market")),
			Map.entry("insight", Set.of("market")),
			Map.entry("savings", Set.of("common")),
			Map.entry("simulation", Set.of("market", "savings", "seedmoney")),
			Map.entry("news", Set.of("common")),
			Map.entry("billing", Set.of("user")),
			Map.entry("engagement", Set.of("simulation", "user", "seedmoney", "ai")),
			Map.entry("ai", Set.of("common")),
			// ingest는 각 도메인의 저장 인터페이스를 쓴다. 도메인 패키지가 생기면 좁힌다.
			Map.entry("ingest", Set.of(ALL)));

	/** HTTP 클라이언트. 앱 연동은 applink, 수집은 ingest, 소셜 로그인은 auth, 목표 안내는 ai가 맡는다(04 §3·§8). */
	private static final List<String> HTTP_CLIENTS = List.of("org.springframework.web.client.RestClient",
			"org.springframework.web.client.RestTemplate", "java.net.http.HttpClient",
			"org.springframework.web.reactive.function.client.WebClient");

	@ArchTest
	static final ArchRule featurePackagesFollowTheTable = classes().that()
		.resideInAPackage("com.flexable.web.*..")
		.should(dependOnlyOnAllowedPackages());

	@ArchTest
	static final ArchRule everyPackageIsInTheTable = classes().that()
		.resideInAPackage("com.flexable.web.*..")
		.should(new ArchCondition<>("be in a package listed in backend/README.md") {
			@Override
			public void check(JavaClass c, ConditionEvents events) {
				if (!ALLOWED.containsKey(feature(c))) {
					events.add(SimpleConditionEvent.violated(c, c.getName() + " is in an unlisted package"));
				}
			}
		});

	@ArchTest
	static final ArchRule httpClientsOnlyInApplinkIngestAuthOrAi = noClasses().that()
		.resideOutsideOfPackages("com.flexable.web.applink..", "com.flexable.web.ingest..", "com.flexable.web.auth..", "com.flexable.web.ai..")
		.should().dependOnClassesThat().haveFullyQualifiedName(HTTP_CLIENTS.get(0))
		.orShould().dependOnClassesThat().haveFullyQualifiedName(HTTP_CLIENTS.get(1))
		.orShould().dependOnClassesThat().haveFullyQualifiedName(HTTP_CLIENTS.get(2))
		.orShould().dependOnClassesThat().haveFullyQualifiedName(HTTP_CLIENTS.get(3));

	/** 다른 패키지의 엔티티·Repository는 직접 쓰지 않는다. 공개 서비스와 DTO만 쓴다. */
	@ArchTest
	static void entitiesAndRepositoriesStayInTheirPackage(JavaClasses all) {
		classes().that().areAnnotatedWith(Entity.class)
			.or().areAssignableTo(org.springframework.data.repository.Repository.class)
			.should(onlyBeUsedFromOwnPackage())
			.check(all);
	}

	private static ArchCondition<JavaClass> dependOnlyOnAllowedPackages() {
		return new ArchCondition<>("depend only on packages allowed by backend/README.md") {
			@Override
			public void check(JavaClass c, ConditionEvents events) {
				String from = feature(c);
				Set<String> allowed = ALLOWED.getOrDefault(from, Set.of());
				if (allowed.contains(ALL)) {
					return;
				}
				for (Dependency d : c.getDirectDependenciesFromSelf()) {
					String to = feature(d.getTargetClass());
					if (to == null || to.isEmpty() || to.equals(from) || to.equals("common") || allowed.contains(to)) {
						continue;
					}
					events.add(SimpleConditionEvent.violated(d, from + " -> " + to + ": " + d.getDescription()));
				}
			}
		};
	}

	private static ArchCondition<JavaClass> onlyBeUsedFromOwnPackage() {
		return new ArchCondition<>("only be used from their own package") {
			@Override
			public void check(JavaClass c, ConditionEvents events) {
				String owner = feature(c);
				Set<String> seen = new HashSet<>();
				for (Dependency d : c.getDirectDependenciesToSelf()) {
					String user = feature(d.getOriginClass());
					if (user != null && !user.equals(owner) && !user.equals("config") && seen.add(user)) {
						events.add(SimpleConditionEvent.violated(d, user + " uses " + c.getSimpleName() + ": " + d.getDescription()));
					}
				}
			}
		};
	}

	/** com.flexable.web.auth.X → "auth". 루트(WebApplication)는 "", 밖의 클래스는 null. */
	private static String feature(JavaClass c) {
		String pkg = c.getPackageName();
		if (pkg.equals("com.flexable.web")) {
			return "";
		}
		if (!pkg.startsWith(ROOT)) {
			return null;
		}
		String rest = pkg.substring(ROOT.length());
		int dot = rest.indexOf('.');
		return dot < 0 ? rest : rest.substring(0, dot);
	}
}
