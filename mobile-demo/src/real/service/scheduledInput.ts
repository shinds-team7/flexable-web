import { validDate } from "./occurredAt";
import { seoulDate } from "./ui";

/**
 * 예정 지출 등록·수정 입력 검사. 문제가 있으면 안내 문구, 없으면 null.
 * 새 날짜는 내일부터만 받고, 수정에서 원래 날짜(`originalDate`)를 그대로 두는 것은 허용한다.
 */
export function scheduledInputError(
  input: {
    amount: number;
    title: string;
    date: string;
    categoryId: number | null;
  },
  originalDate?: string,
): string | null {
  const title = input.title.trim();
  if (
    !input.categoryId ||
    !Number.isInteger(input.amount) ||
    input.amount < 1 ||
    input.amount >= 1e12 ||
    !title ||
    title.length > 40 ||
    !validDate(input.date)
  )
    return "금액·카테고리·내용·날짜를 확인해 주세요";
  if (input.date <= seoulDate() && input.date !== originalDate)
    return "내일부터의 날짜를 선택해 주세요";
  return null;
}
