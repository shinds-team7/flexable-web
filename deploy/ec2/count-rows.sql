-- 이전 전후 행 수 비교(MIGRATION.md). 지금 DB의 모든 표를 정확히 센다. 웹 VM과 EC2에서 같은 결과가 나와야 한다.
SET SESSION group_concat_max_len = 1000000;
SELECT GROUP_CONCAT(CONCAT('SELECT ''', TABLE_NAME, ''' AS t, COUNT(*) AS n FROM `', TABLE_NAME, '`') ORDER BY TABLE_NAME SEPARATOR ' UNION ALL ')
  INTO @q FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE';
PREPARE s FROM @q;
EXECUTE s;
DEALLOCATE PREPARE s;
SELECT MAX(CAST(version AS UNSIGNED)) AS flyway_version FROM flyway_schema_history WHERE success = 1;
