package com.flexable.web.auth;

import java.time.OffsetDateTime;

import com.flexable.web.user.UserDtos.UserResponse;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public final class AuthDtos {

	private AuthDtos() {
	}

	/** 입력 규칙은 앱 가입과 같다(project2 AuthDtos). 계정은 따로다. */
	public record SignupRequest(
			@NotBlank(message = "이메일을 입력해 주세요") @Email(message = "이메일 형식을 확인해 주세요") @Size(max = 254, message = "이메일 형식을 확인해 주세요") String email,
			@NotNull(message = "비밀번호를 입력해 주세요") @Size(min = 8, max = 64, message = "비밀번호는 8자 이상 64자 이하로 입력해 주세요") @Pattern(regexp = "^(?=.*[A-Za-z])(?=.*\\d).+$", message = "비밀번호에 영문과 숫자를 모두 넣어 주세요") String password,
			@AssertTrue(message = "서비스 이용약관에 동의해 주세요") boolean agreeTerms,
			@AssertTrue(message = "개인정보 수집·이용에 동의해 주세요") boolean agreePrivacy) {
	}

	public record LoginRequest(
			@NotBlank(message = "이메일을 입력해 주세요") @Size(max = 254, message = "이메일 형식을 확인해 주세요") String email,
			@NotBlank(message = "비밀번호를 입력해 주세요") String password) {
	}

	/** 이메일 계정은 password, 소셜이 붙은 계정은 confirm("탈퇴"). project2와 같은 모양이다. */
	public record WithdrawRequest(String password, String confirm) {
	}

	/** GET /me와 로그인 응답의 user. provider는 email·kakao·google 중 하나. */
	public record MeResponse(long id, String email, OffsetDateTime createdAt, String provider, boolean hasPassword) {

		static MeResponse of(UserResponse user, String provider, boolean hasPassword) {
			return new MeResponse(user.id(), user.email(), user.createdAt(), provider, hasPassword);
		}
	}

	public record AuthResponse(String accessToken, OffsetDateTime expiresAt, MeResponse user) {
	}
}
