package com.flexable.web.news;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

interface YouthNewsRawRepository extends JpaRepository<YouthNewsRaw, Long> {

	Optional<YouthNewsRaw> findBySourceAndExternalId(String source, String externalId);
}
