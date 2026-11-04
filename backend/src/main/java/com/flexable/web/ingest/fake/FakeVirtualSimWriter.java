package com.flexable.web.ingest.fake;

import java.util.EnumMap;
import java.util.List;

import com.flexable.web.ingest.VirtualSimWriter;
import com.flexable.web.virtualsim.VirtualSimCategory;
import com.flexable.web.virtualsim.VirtualSimSample;
import com.flexable.web.virtualsim.VirtualSimSample.Draft;

/**
 * 키 없이 쓰는 예시 회사 글(VIRTUAL_SIM_SOURCE=fake, decisions/2026-11-04-virtual-simulation 4-8). 요청 id 순서대로 예시 회사 6곳의 정해진 글을 돌려준다.
 * 화면은 "AI 생성" 대신 "예시"로 보인다. 같은 검사를 거쳐 isSample로 저장한다.
 */
public class FakeVirtualSimWriter implements VirtualSimWriter {

	@Override
	public boolean enabled() {
		return true;
	}

	/** Gemini를 부르지 않아 하루 호출 수에 세지 않는다 */
	@Override
	public boolean sample() {
		return true;
	}

	@Override
	public String model() {
		return VirtualSimSample.MODEL;
	}

	@Override
	public String promptVersion() {
		return VirtualSimSample.PROMPT_VERSION;
	}

	@Override
	public List<Written> write(List<Request> batch) {
		List<Draft> companies = VirtualSimSample.companies();
		return batch.stream().map(r -> {
			Draft d = companies.get(Math.floorMod(r.id(), companies.size()));
			var bodies = new EnumMap<VirtualSimCategory, String>(VirtualSimCategory.class);
			d.bodies().forEach((c, body) -> {
				if (r.categories().contains(c)) {
					bodies.put(c, body);
				}
			});
			return new Written(r.id(), new Draft(d.name(), d.industry(), d.intro(), bodies));
		}).toList();
	}
}
