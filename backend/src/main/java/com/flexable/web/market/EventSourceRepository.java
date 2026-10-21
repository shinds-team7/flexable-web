package com.flexable.web.market;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface EventSourceRepository extends JpaRepository<EventSource, Long> {

	List<EventSource> findByEventIdInOrderByWeightDescPublishedDateDesc(Collection<Long> eventIds);

	List<EventSource> findByEventIdAndType(long eventId, String type);

	List<EventSource> findByEventIdOrderByWeightDescPublishedDateDesc(long eventId);
}
