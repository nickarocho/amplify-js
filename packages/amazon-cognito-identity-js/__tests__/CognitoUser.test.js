import CognitoUser from '../src/CognitoUser';

import CognitoUserPool from '../src/CognitoUserPool';
import AuthenticationDetails from '../src/AuthenticationDetails';
import AuthenticationHelper from '../src/AuthenticationHelper';
import Client from '../src/Client';
import CognitoIdToken from '../src/CognitoIdToken';
import CognitoAccessToken from '../src/CognitoAccessToken';
import CognitoRefreshToken from '../src/CognitoRefreshToken';

import { authHelperMock, netRequestMockSuccess } from '../__mocks__/mocks';

import {
	clientId,
	userPoolId,
	authDetailData,
	vCognitoUserSession,
	deviceName,
	totpCode,
	ivCognitoUserSession,
	networkError,
	genHashDevices,
	getSalt,
	getVerifiers,
} from './constants';
import { CognitoUserSession } from 'amazon-cognito-identity-js';

const minimalData = { UserPoolId: userPoolId, ClientId: clientId };
const cognitoUserPool = new CognitoUserPool(minimalData);
const userDefaults = {
	Username: 'username',
	Pool: cognitoUserPool,
};

describe('CognitoUser constructor', () => {
	test('constructor throws error when bad (or no) data is passed', () => {
		const errorMsg = 'Username and Pool information are required.';

		// no data at all
		expect(() => {
			new CognitoUser({});
		}).toThrow(errorMsg);

		// missing Pool
		expect(() => {
			new CognitoUser({
				Username: 'username',
				Pool: null,
			});
		}).toThrow(errorMsg);

		// missing Username
		expect(() => {
			new CognitoUser({
				Username: null,
				Pool: userPoolId,
			});
		}).toThrow(errorMsg);
	});

	test('happy case constructor', () => {
		const spyon = jest.spyOn(cognitoUserPool, 'getClientId');

		expect(() => {
			new CognitoUser({ ...userDefaults });
		}).not.toThrowError();

		expect(spyon).toBeCalled();
	});
});

describe('getters and setters', () => {
	const user = new CognitoUser({ ...userDefaults });

	test('get and set SignInUserSession', () => {
		// initial state
		expect(user.getSignInUserSession()).toEqual(null);

		// setting explicitly
		user.setSignInUserSession(vCognitoUserSession);
		expect(user.signInUserSession).toEqual(vCognitoUserSession);

		// getter after set explicitly
		expect(user.getSignInUserSession()).toEqual(vCognitoUserSession);
	});

	test('getUsername()', () => {
		expect(user.getUsername()).toEqual(user.username);
	});

	test('get and set authenticationFlowType', () => {
		// initial state
		expect(user.getAuthenticationFlowType()).toEqual('USER_SRP_AUTH');

		// setting explicitly
		user.setAuthenticationFlowType('TEST_FLOW_TYPE');

		// getter after set explicitly
		expect(user.getAuthenticationFlowType()).toEqual('TEST_FLOW_TYPE');
	});
});

describe('initiateAuth()', () => {
	const callback = {
		onFailure: jest.fn(),
		onSuccess: jest.fn(),
		customChallenge: jest.fn(),
	};

	let user;
	beforeEach(() => {
		user = new CognitoUser({ ...userDefaults });
	});

	afterAll(() => {
		jest.restoreAllMocks();
	});

	afterEach(() => {
		callback.onFailure.mockClear();
		callback.onSuccess.mockClear();
		callback.customChallenge.mockClear();
	});

	test('Client request called once and throws an error', async () => {
		jest.spyOn(Client.prototype, 'request').mockImplementation((...args) => {
			const err = new Error('Test error');
			args[2](err, {});
		});

		const authDetails = new AuthenticationDetails(authDetailData);
		user.initiateAuth(authDetails, callback);

		expect(callback.onFailure.mock.calls.length).toBe(1);
		expect(callback.onSuccess.mock.calls.length).toBe(0);
	});

	test('Client request called once with challenge name and params', async () => {
		jest.spyOn(Client.prototype, 'request').mockImplementation((...args) => {
			args[2](null, {
				ChallengeName: 'CUSTOM_CHALLENGE',
				Session: vCognitoUserSession,
				ChallengeParameters: 'Custom challenge params',
			});
		});

		const authDetails = new AuthenticationDetails(authDetailData);
		user.initiateAuth(authDetails, callback);

		expect(user.Session).toMatchObject(vCognitoUserSession);
		expect(callback.customChallenge.mock.calls.length).toBe(1);
		expect(callback.customChallenge).toBeCalledWith('Custom challenge params');
	});

	test('Client request sets signInUserSession and is successful', async () => {
		jest.spyOn(Client.prototype, 'request').mockImplementation((...args) => {
			args[2](null, { AuthenticationResult: 'great success' });
		});

		const getCognitoUserSessionSpy = jest.spyOn(user, 'getCognitoUserSession');
		const cacheTokensSpy = jest.spyOn(user, 'cacheTokens');

		const authDetails = new AuthenticationDetails(authDetailData);
		user.initiateAuth(authDetails, callback);

		expect(getCognitoUserSessionSpy).toBeCalledWith('great success');
		expect(cacheTokensSpy).toBeCalled();
		expect(callback.onSuccess.mock.calls.length).toBe(1);
	});
});

describe('authenticateUser()', () => {
	afterAll(() => {
		jest.restoreAllMocks();
	});

	const user = new CognitoUser({ ...userDefaults });
	const authDetails = new AuthenticationDetails(authDetailData);
	const callback = {
		onFailure: jest.fn(),
	};

	test('USER_PASSWORD_AUTH flow type', () => {
		const spyon = jest.spyOn(user, 'authenticateUserPlainUsernamePassword');

		user.setAuthenticationFlowType('USER_PASSWORD_AUTH');
		user.authenticateUser(authDetails, callback);

		expect(spyon).toHaveBeenCalledWith(authDetails, callback);
	});

	test('USER_SRP_AUTH and CUSTOM_AUTH flow types', () => {
		const spyon = jest.spyOn(user, 'authenticateUserDefaultAuth');

		user.setAuthenticationFlowType('USER_SRP_AUTH');
		user.authenticateUser(authDetails, callback);

		expect(spyon).toHaveBeenCalledWith(authDetails, callback);

		user.setAuthenticationFlowType('CUSTOM_AUTH');
		user.authenticateUser(authDetails, callback);

		expect(spyon).toHaveBeenCalledWith(authDetails, callback);
	});

	test('throws error for invalid Authentication flow type', () => {
		user.setAuthenticationFlowType('WRONG_AUTH_FLOW_TYPE');
		user.authenticateUser(authDetails, callback);
		expect(callback.onFailure.mock.calls.length).toBe(1);
	});
});

describe('authenticateUserDefaultAuth()', () => {
	const user = new CognitoUser({ ...userDefaults });
	const authDetails = new AuthenticationDetails(authDetailData);
	const callback = {
		onFailure: jest.fn(),
		customChallenge: jest.fn(),
	};

	afterEach(() => {
		jest.restoreAllMocks();
		callback.onFailure.mockClear();
		callback.customChallenge.mockClear();
	});

	test('Happy case default initialization process', () => {
		expect(() => {
			user.authenticateUserDefaultAuth(authDetails, callback);
		}).not.toThrowError();
	});

	test('errOnAValue fails gracefully', () => {
		const spyon = jest
			.spyOn(AuthenticationHelper.prototype, 'getLargeAValue')
			.mockImplementation(cb => cb('test error', 12345));

		user.authenticateUserDefaultAuth(authDetails, callback);

		expect(callback.onFailure.mock.calls.length).toBe(1);
		expect(callback.onFailure).toBeCalledWith('test error');

		spyon.mockClear();
	});

	test('Client request fails gracefully', () => {
		const err = new Error('Test error');
		const spyon = jest
			.spyOn(Client.prototype, 'request')
			.mockImplementation((...args) => {
				args[2](err, {});
			});

		user.authenticateUserDefaultAuth(authDetails, callback);

		expect(callback.onFailure).toBeCalledWith(err);

		spyon.mockClear();
	});
});

describe('authenticateUserPlainUsernamePassword()', () => {
	const user = new CognitoUser({ ...userDefaults });
	const callback = {
		onFailure: jest.fn(),
	};

	afterEach(() => {
		jest.restoreAllMocks();
		callback.onFailure.mockClear();
	});

	test('Missing password throws an error', () => {
		const authDetails = new AuthenticationDetails({
			Username: 'user@amzn.com',
			Password: undefined,
		});

		user.authenticateUserPlainUsernamePassword(authDetails, callback);

		expect(callback.onFailure).toBeCalledWith(
			new Error('PASSWORD parameter is required')
		);
	});

	test('Client request fails gracefully', () => {
		jest.spyOn(Client.prototype, 'request').mockImplementation((...args) => {
			args[2]('test error', {});
		});

		const authDetails = new AuthenticationDetails(authDetailData);

		user.authenticateUserPlainUsernamePassword(authDetails, callback);

		expect(callback.onFailure.mock.calls.length).toBe(1);
		expect(callback.onFailure).toBeCalledWith('test error');
	});

	test('Authenticate user happy case', () => {
		const userSpy = jest.spyOn(user, 'getCachedDeviceKeyAndPassword');
		const userSpy2 = jest.spyOn(user, 'getUserContextData');
		userSpy2.mockReturnValue(true);
		const userSpy3 = jest.spyOn(user, 'authenticateUserInternal');
		userSpy3.mockReturnValue('test return value');

		jest.spyOn(Client.prototype, 'request').mockImplementation((...args) => {
			args[2](null, 'test auth result');
		});

		const authDetails = new AuthenticationDetails(authDetailData);
		user.authenticateUserPlainUsernamePassword(authDetails, callback);

		expect(userSpy).toBeCalled();
		expect(userSpy3).toBeCalledWith(
			'test auth result',
			userSpy3.mock.calls[0][1],
			callback
		);
		expect(userSpy3.mock.results[0].value).toBe('test return value');
	});
});

describe('authenticateUserInternal()', () => {
	const user = new CognitoUser({ ...userDefaults });
	const callback = {
		onSuccess: jest.fn(),
		onFailure: jest.fn(),
		mfaRequired: jest.fn(),
		selectMFAType: jest.fn(),
		mfaSetup: jest.fn(),
		totpRequired: jest.fn(),
		customChallenge: jest.fn(),
		newPasswordRequired: jest.fn(),
	};

	// same approach as used in CognitoUser.js
	const authHelper = new AuthenticationHelper(
		user.pool.getUserPoolId().split('_')[1]
	);

	const authData = Object.assign(vCognitoUserSession, {
		ChallengeParameters: {
			userAttributes: '[]',
			requiredAttributes: '[]',
		},
		AuthenticationResult: {
			NewDeviceMetadata: {
				DeviceGroupKey: 'abc123',
				DeviceKey: '123abc',
			},
		},
		Session: vCognitoUserSession,
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	test.each([
		['SMS_MFA', callback.mfaRequired],
		['SELECT_MFA_TYPE', callback.selectMFAType],
		['MFA_SETUP', callback.mfaSetup],
		['SOFTWARE_TOKEN_MFA', callback.totpRequired],
		['CUSTOM_CHALLENGE', callback.customChallenge],
	])(
		'%s challenge sets user session and calls the corresponding cb',
		(challengeName, cbMethod) => {
			Object.assign(authData, { ChallengeName: challengeName });

			user.authenticateUserInternal(authData, authHelper, callback);

			expect(user.Session).toMatchObject(vCognitoUserSession);

			if (challengeName === 'CUSTOM_CHALLENGE') {
				// this cb signature only expects one arg
				expect(cbMethod).toHaveBeenCalledWith(authData.ChallengeParameters);
			} else {
				// the rest expect two args
				expect(cbMethod).toHaveBeenCalledWith(
					challengeName,
					authData.ChallengeParameters
				);
			}

			// clear the respective mock
			cbMethod.mockClear();
		}
	);

	test('user and required attributes get parsed and call newPasswordRequired', () => {
		Object.assign(authData, { ChallengeName: 'NEW_PASSWORD_REQUIRED' });

		expect(user.Session).toMatchObject(vCognitoUserSession);

		const spyon = jest.spyOn(
			authHelper,
			'getNewPasswordRequiredChallengeUserAttributePrefix'
		);
		user.authenticateUserInternal(authData, authHelper, callback);
		expect(spyon).toHaveBeenCalledTimes(1);
		expect(callback.newPasswordRequired).toHaveBeenCalledTimes(1);
		callback.newPasswordRequired.mockClear();
	});

	test('DEVICE_SRP_AUTH calls getDeviceResponse and returns undefined', () => {
		Object.assign(authData, { ChallengeName: 'DEVICE_SRP_AUTH' });

		const spyon = jest.spyOn(user, 'getDeviceResponse');

		user.authenticateUserInternal(authData, authHelper, callback);

		expect(spyon).toHaveBeenCalledTimes(1);

		spyon.mockClear();
	});

	test('All other challenge names trigger method calls and success cb', () => {
		Object.assign(authData, {
			AuthenticationResult: {
				NewDeviceMetadata: null,
			},
			ChallengeName: 'random challenge',
		});

		const spyon = jest.spyOn(user, 'getCognitoUserSession');
		const spyon2 = jest.spyOn(user, 'cacheTokens');

		user.authenticateUserInternal(authData, authHelper, callback);

		expect(user.challengeName).toBe(authData.ChallengeName);
		expect(spyon).toHaveBeenCalledWith(authData.AuthenticationResult);
		expect(spyon2).toBeCalledTimes(1);

		const signInUserSession = user.getCognitoUserSession(
			authData.AuthenticationResult
		);
		expect(callback.onSuccess).toBeCalledWith(signInUserSession);

		spyon.mockClear();
		spyon2.mockClear();
		callback.onSuccess.mockClear();
	});

	test('AuthHelper generateHashDevice is called and can log errors properly', () => {
		Object.assign(authData, {
			AuthenticationResult: {
				NewDeviceMetadata: {
					DeviceGroupKey: 'abc123',
					DeviceKey: '123abc',
				},
			},
			ChallengeName: 'random challenge',
		});

		const err = new Error('Very critical and descriptive error.');

		const spyon = jest
			.spyOn(AuthenticationHelper.prototype, 'generateHashDevice')
			.mockImplementation((...args) => {
				args[2](err);
			});

		user.authenticateUserInternal(authData, authHelper, callback);

		expect(spyon).toBeCalledTimes(1);
		expect(callback.onFailure).toBeCalledWith(err);

		spyon.mockClear();
		callback.onFailure.mockClear();
	});

	test('AuthHelper generateHashDevice with no error calls auth methods', () => {
		const spyon1 = jest.spyOn(
			AuthenticationHelper.prototype,
			'getRandomPassword'
		);
		const spyon2 = jest.spyOn(
			AuthenticationHelper.prototype,
			'getVerifierDevices'
		);
		const spyon3 = jest.spyOn(
			AuthenticationHelper.prototype,
			'getRandomPassword'
		);

		user.authenticateUserInternal(authData, authHelper, callback);

		expect(spyon1).toBeCalledTimes(1);
		expect(spyon2).toBeCalledTimes(1);
		expect(spyon3).toBeCalledTimes(1);

		spyon1.mockClear();
		spyon2.mockClear();
		spyon3.mockClear();
	});

	test('Client request fails gracefully', () => {
		const err = new Error('Client request error.');

		jest
			.spyOn(Client.prototype, 'request')
			.mockImplementationOnce((...args) => {
				args[2](err, {});
			});

		user.authenticateUserInternal(authData, authHelper, callback);

		expect(callback.onFailure).toBeCalledWith(err);

		callback.onFailure.mockClear();
	});

	test('Successful client request passes data properly to cb', () => {
		const spyon = jest
			.spyOn(Client.prototype, 'request')
			.mockImplementationOnce((...args) => {
				args[2](null, {
					UserConfirmationNecessary: true,
				});
			});

		user.authenticateUserInternal(authData, authHelper, callback);

		expect(callback.onSuccess).toBeCalledWith(user.signInUserSession, true);

		spyon.mockClear();
		callback.onSuccess.mockClear();

		netRequestMockSuccess(true);

		user.authenticateUserInternal(authData, authHelper, callback);

		expect(callback.onSuccess).toBeCalledWith(user.signInUserSession);

		callback.onSuccess.mockClear();
	});
});

describe('completeNewPasswordChallenge()', () => {
	const user = new CognitoUser({ ...userDefaults });
	const callback = {
		onFailure: jest.fn(),
	};
	const requiredAttributeData = {
		attr1: true,
		attr2: 'important',
		attr3: [123, 'abc', true],
	};
	const clientMetadata = {
		meta1: false,
		meta2: 'test val',
		meta3: [456, 'xyz', false],
	};

	afterEach(() => {
		jest.restoreAllMocks();
	});

	test('No newPassword triggers an error', () => {
		const err = new Error('New password is required.');

		user.completeNewPasswordChallenge(null, null, callback, null);

		expect(callback.onFailure).toBeCalledWith(err);
	});

	test('No newPassword triggers an error', () => {
		const err = new Error('New password is required.');

		user.completeNewPasswordChallenge(null, null, callback, null);

		expect(callback.onFailure).toBeCalledWith(err);
	});

	test('completeNewPasswordChallenge calls expected helper methods', () => {
		const spyon = jest.spyOn(
			AuthenticationHelper.prototype,
			'getNewPasswordRequiredChallengeUserAttributePrefix'
		);
		const spyon2 = jest.spyOn(user, 'getUserContextData');

		user.completeNewPasswordChallenge(
			'NEWp@ssw0rd',
			requiredAttributeData,
			callback,
			clientMetadata
		);

		expect(spyon).toBeCalledTimes(1);
		expect(spyon2).toHaveBeenCalled();
		spyon.mockClear();
		spyon2.mockClear();
	});

	test('Client request fails gracefully', () => {
		const err = new Error('Respond to auth challenge error.');

		jest
			.spyOn(Client.prototype, 'request')
			.mockImplementationOnce((...args) => {
				args[2](err, {});
			});

		user.completeNewPasswordChallenge(
			'NEWp@ssw0rd',
			requiredAttributeData,
			callback,
			clientMetadata
		);

		expect(callback.onFailure).toBeCalledWith(err);
		callback.onFailure.mockClear();
	});

	test('Client request happy path', () => {
		const spyon = jest
			.spyOn(Client.prototype, 'request')
			.mockImplementationOnce((...args) => {
				args[2](null, vCognitoUserSession);
			});
		const spyon2 = jest.spyOn(user, 'authenticateUserInternal');

		user.completeNewPasswordChallenge(
			'NEWp@ssw0rd',
			requiredAttributeData,
			callback,
			clientMetadata
		);

		expect(spyon2).toBeCalledTimes(1);
		spyon.mockClear();
		spyon2.mockClear();
	});
});

describe('getDeviceResponse()', () => {
	const user = new CognitoUser({ ...userDefaults });
	const callback = {
		onFailure: jest.fn(),
		onSuccess: jest.fn(),
	};

	afterAll(() => {
		jest.restoreAllMocks();
	});

	test('Auth helper bad getLargeAValue fails gracefully', () => {
		const err = new Error('Cannot get large A value for some reason.');
		const spyon = jest
			.spyOn(AuthenticationHelper.prototype, 'getLargeAValue')
			.mockImplementation(cb => cb(err, 12345));

		user.getDeviceResponse(callback, {});

		expect(callback.onFailure).toBeCalledWith(err);

		callback.onFailure.mockClear();
		spyon.mockClear();
	});

	test('Auth helper bad getLargeAValue fails gracefully', () => {
		const err = new Error('Cannot get large A value for some reason.');
		const spyon = jest
			.spyOn(AuthenticationHelper.prototype, 'getLargeAValue')
			.mockImplementation(cb => cb(err, 12345));

		user.getDeviceResponse(callback, {});

		expect(callback.onFailure).toBeCalledWith(err);
		callback.onFailure.mockClear();
		spyon.mockClear();
	});

	test('Auth helper getLargeAValue happy path', () => {
		const spyon = jest
			.spyOn(AuthenticationHelper.prototype, 'getLargeAValue')
			.mockImplementation(cb => cb(null, 12345));
		const spyon2 = jest.spyOn(user, 'getUserContextData');

		user.getDeviceResponse(callback, {});

		expect(callback.onFailure).not.toBeCalled();
		expect(spyon2).toBeCalled();

		callback.onFailure.mockClear();
		spyon.mockClear();
		spyon2.mockClear();
	});

	test('Client request RespondToAuthChallenge fails gracefully', () => {
		const err = new Error('RespondToAuthChallenge error');

		const spyon = jest
			.spyOn(Client.prototype, 'request')
			.mockImplementationOnce((...args) => {
				args[2](err, vCognitoUserSession);
			});

		user.getDeviceResponse(callback, {});

		expect(callback.onFailure).toBeCalledWith(err);

		callback.onFailure.mockClear();
		spyon.mockClear();
	});

	describe('RespondToAuthChallenge nested Client method suite', () => {
		let clientRequestSpy;
		let defaultConfig = {
			ChallengeName: 'CUSTOM_CHALLENGE',
			Session: vCognitoUserSession,
			ChallengeParameters: {
				USER_ID_FOR_SRP: 'abc123',
				SRP_B: 'abc123',
				SALT: 'abc123',
				SECRET_BLOCK: 'verysecret',
			},
		};

		beforeEach(() => {
			user.deviceGroupKey = 'abc123';
			user.deviceKey = '123abc';

			clientRequestSpy = jest
				.spyOn(Client.prototype, 'request')
				.mockImplementation((...args) => {
					args[2](null, defaultConfig);
				});
		});

		afterEach(() => {
			clientRequestSpy.mockClear();
		});

		test('Client request RespondToAuthChallenge - getPasswordAuthenticationKey cb fails gracefully', () => {
			const err = new Error('errHkdf Error');

			const spyon = jest
				.spyOn(AuthenticationHelper.prototype, 'getPasswordAuthenticationKey')
				.mockImplementation((...args) => {
					args[4](err, null);
				});

			user.getDeviceResponse(callback, {});

			expect(callback.onFailure).toBeCalledWith(err);

			callback.onFailure.mockClear();

			spyon.mockClear();
		});

		test('Client request RespondToAuthChallenge - getPasswordAuthenticationKey CryptoJS code runs smoothly', () => {
			const spyon = jest
				.spyOn(AuthenticationHelper.prototype, 'getPasswordAuthenticationKey')
				.mockImplementation((...args) => {
					args[4](null, 'hkdf value');
				});

			const spyon2 = jest.spyOn(user, 'getUserContextData');

			user.getDeviceResponse(callback, {});

			expect(spyon2).toBeCalled();

			callback.onFailure.mockClear();

			spyon.mockClear();
			spyon2.mockClear();
		});

		test('Client request RespondToAuthChallenge nested client fails gracefully', () => {
			const err = new Error('RespondToAuthChallenge nested Client error');

			const spyon = jest
				.spyOn(Client.prototype, 'request')
				.mockImplementation((...args) => {
					args[2](err, {});
				});

			user.getDeviceResponse(callback, {});

			expect(callback.onFailure).toBeCalledWith(err);

			callback.onFailure.mockClear();
			spyon.mockClear();
		});

		test('Client request RespondToAuthChallenge nested client calls success callbacks', () => {
			const spyon = jest.spyOn(user, 'getCognitoUserSession');
			const spyon2 = jest.spyOn(user, 'cacheTokens');

			user.getDeviceResponse(callback, {});

			expect(spyon).toBeCalledTimes(1);
			expect(spyon2).toBeCalledTimes(1);
			expect(callback.onSuccess).toBeCalledWith(user.signInUserSession);

			callback.onSuccess.mockClear();
			spyon.mockClear();
			spyon2.mockClear();
		});
	});
});

describe('confirmRegistration()', () => {
	const user = new CognitoUser({ ...userDefaults });
	const callback = jest.fn();
	let [confirmationCode, forceAliasCreation] = ['abc123', true];
	const clientMetadata = { meta1: 'value 1', meta2: 'value 2' };

	test('ConfirmSignUp fails gracefully', () => {
		const err = new Error('ConfirmSignUp');
		const spyon = jest
			.spyOn(Client.prototype, 'request')
			.mockImplementation((...args) => {
				args[2](err);
			});
		const spyon2 = jest.spyOn(user, 'getUserContextData');
		user.confirmRegistration(
			confirmationCode,
			forceAliasCreation,
			callback,
			clientMetadata
		);

		expect(spyon).toBeCalled();
		expect(spyon2).toBeCalled();
		expect(callback).toBeCalledWith(err, null);

		spyon.mockClear();
		spyon2.mockClear();
		callback.mockClear();
	});

	test('ConfirmSignUp returns SUCCESS', () => {
		const spyon = jest
			.spyOn(Client.prototype, 'request')
			.mockImplementation((...args) => {
				args[2](null);
			});

		const spyon2 = jest.spyOn(user, 'getUserContextData');
		user.confirmRegistration(
			confirmationCode,
			forceAliasCreation,
			callback,
			clientMetadata
		);

		expect(spyon2).toBeCalled();
		expect(callback).toBeCalledWith(null, 'SUCCESS');

		spyon.mockClear();
		spyon2.mockClear();
		callback.mockClear();
	});
});

describe('sendCustomChallengeAnswer()', () => {
	const user = new CognitoUser({ ...userDefaults });
	const callback = {
		onSuccess: jest.fn(),
		onFailure: jest.fn(),
	};
	let answerChallenge = 'the answer';
	let clientMetadata = { meta1: 'value 1', meta2: 'value2' };

	user.Session = vCognitoUserSession;
	Object.assign(vCognitoUserSession, {
		AuthenticationResult: {
			NewDeviceMetadata: {
				DeviceGroupKey: 'abc123',
				DeviceKey: '123abc',
			},
		},
		ChallengeName: 'random challenge',
	});

	test('send custom challenge happy path', () => {
		const spyon = jest
			.spyOn(Client.prototype, 'request')
			.mockImplementation((...args) => {
				args[2](null, vCognitoUserSession);
			});

		const spyon2 = jest.spyOn(user, 'getCachedDeviceKeyAndPassword');
		const spyon3 = jest.spyOn(user, 'authenticateUserInternal');

		user.sendCustomChallengeAnswer(answerChallenge, callback, clientMetadata);

		expect(spyon2).toBeCalledTimes(1);
		expect(spyon3).toBeCalled();

		spyon.mockClear();
		spyon2.mockClear();
		spyon3.mockClear();
	});

	test('send custom challenge fails gracefully', () => {
		const err = new Error('RespondToAuthChallenge error.');
		const spyon = jest
			.spyOn(Client.prototype, 'request')
			.mockImplementation((...args) => {
				args[2](err, vCognitoUserSession);
			});

		user.sendCustomChallengeAnswer(answerChallenge, callback, clientMetadata);

		expect(callback.onFailure).toBeCalledWith(err);

		spyon.mockClear();
	});
});

describe('sendMFACode()', () => {
	const user = new CognitoUser({ ...userDefaults });
	const confirmationCode = 'abc123';
	const callback = {
		onFailure: jest.fn(),
	};
	let mfaType;
	const clientMetadata = { meta1: 'value 1', meta2: 'value 2' };

	test('sendMFACode gets initialized properly', () => {
		const spyon = jest.spyOn(user, 'getUserContextData');

		user.sendMFACode(confirmationCode, callback, mfaType, clientMetadata);

		expect(spyon).toHaveBeenCalled();

		spyon.mockClear();
	});
});

describe('Testing verify Software Token with a signed in user', () => {
	const minimalData = { UserPoolId: userPoolId, ClientId: clientId };
	const cognitoUserPool = new CognitoUserPool(minimalData);
	const cognitoUser = new CognitoUser({
		Username: 'username',
		Pool: cognitoUserPool,
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	test('No newPassword triggers an error', () => {
		const err = new Error('New password is required.');

		user.completeNewPasswordChallenge(null, null, callback, null);

		expect(callback.onFailure).toBeCalledWith(err);
	});

	test('No newPassword triggers an error', () => {
		const err = new Error('New password is required.');

		user.completeNewPasswordChallenge(null, null, callback, null);

		expect(callback.onFailure).toBeCalledWith(err);
	});

	test('completeNewPasswordChallenge calls expected helper methods', () => {
		const spyon = jest.spyOn(
			AuthenticationHelper.prototype,
			'getNewPasswordRequiredChallengeUserAttributePrefix'
		);
		const spyon2 = jest.spyOn(user, 'getUserContextData');

		user.completeNewPasswordChallenge(
			'NEWp@ssw0rd',
			requiredAttributeData,
			callback,
			clientMetadata
		);

		expect(spyon).toBeCalledTimes(1);
		expect(spyon2).toHaveBeenCalled();
		spyon.mockClear();
		spyon2.mockClear();
	});

	test('Client request fails gracefully', () => {
		const err = new Error('Respond to auth challenge error.');

		jest
			.spyOn(Client.prototype, 'request')
			.mockImplementationOnce((...args) => {
				args[2](err, {});
			});

		user.completeNewPasswordChallenge(
			'NEWp@ssw0rd',
			requiredAttributeData,
			callback,
			clientMetadata
		);

		expect(callback.onFailure).toBeCalledWith(err);
		callback.onFailure.mockClear();
	});

	test('Client request happy path', () => {
		const spyon = jest
			.spyOn(Client.prototype, 'request')
			.mockImplementationOnce((...args) => {
				args[2](null, vCognitoUserSession);
			});
		const spyon2 = jest.spyOn(user, 'authenticateUserInternal');

		user.completeNewPasswordChallenge(
			'NEWp@ssw0rd',
			requiredAttributeData,
			callback,
			clientMetadata
		);

		expect(spyon2).toBeCalledTimes(1);
		spyon.mockClear();
		spyon2.mockClear();
	});
});

describe('getDeviceResponse()', () => {
	const user = new CognitoUser({ ...userDefaults });
	const callback = {
		onFailure: jest.fn(),
		onSuccess: jest.fn(),
	};

	afterAll(() => {
		jest.restoreAllMocks();
	});

	test('Auth helper bad getLargeAValue fails gracefully', () => {
		const err = new Error('Cannot get large A value for some reason.');
		const spyon = jest
			.spyOn(AuthenticationHelper.prototype, 'getLargeAValue')
			.mockImplementation(cb => cb(err, 12345));

		user.
    
    
    (callback, {});

		expect(callback.onFailure).toBeCalledWith(err);

		callback.onFailure.mockClear();
		spyon.mockClear();
	});

	test('Auth helper bad getLargeAValue fails gracefully', () => {
		const err = new Error('Cannot get large A value for some reason.');
		const spyon = jest
			.spyOn(AuthenticationHelper.prototype, 'getLargeAValue')
			.mockImplementation(cb => cb(err, 12345));

		user.getDeviceResponse(callback, {});

		expect(callback.onFailure).toBeCalledWith(err);
		callback.onFailure.mockClear();
		spyon.mockClear();
	});

	test('Auth helper getLargeAValue happy path', () => {
		const spyon = jest
			.spyOn(AuthenticationHelper.prototype, 'getLargeAValue')
			.mockImplementation(cb => cb(null, 12345));
		const spyon2 = jest.spyOn(user, 'getUserContextData');

		user.getDeviceResponse(callback, {});

		expect(callback.onFailure).not.toBeCalled();
		expect(spyon2).toBeCalled();

		callback.onFailure.mockClear();
		spyon.mockClear();
		spyon2.mockClear();
	});

	test('Client request RespondToAuthChallenge fails gracefully', () => {
		const err = new Error('RespondToAuthChallenge error');

		const spyon = jest
			.spyOn(Client.prototype, 'request')
			.mockImplementationOnce((...args) => {
				args[2](err, vCognitoUserSession);
			});

		user.getDeviceResponse(callback, {});

		expect(callback.onFailure).toBeCalledWith(err);

		callback.onFailure.mockClear();
		spyon.mockClear();
	});

	describe('RespondToAuthChallenge nested Client method suite', () => {
		let clientRequestSpy;
		let defaultConfig = {
			ChallengeName: 'CUSTOM_CHALLENGE',
			Session: vCognitoUserSession,
			ChallengeParameters: {
				USER_ID_FOR_SRP: 'abc123',
				SRP_B: 'abc123',
				SALT: 'abc123',
				SECRET_BLOCK: 'verysecret',
			},
		};

		beforeEach(() => {
			user.deviceGroupKey = 'abc123';
			user.deviceKey = '123abc';

			clientRequestSpy = jest
				.spyOn(Client.prototype, 'request')
				.mockImplementation((...args) => {
					args[2](null, defaultConfig);
				});
		});

		afterEach(() => {
			clientRequestSpy.mockClear();
		});

		test('Client request RespondToAuthChallenge - getPasswordAuthenticationKey cb fails gracefully', () => {
			const err = new Error('errHkdf Error');

			const spyon = jest
				.spyOn(AuthenticationHelper.prototype, 'getPasswordAuthenticationKey')
				.mockImplementation((...args) => {
					args[4](err, null);
				});

			user.getDeviceResponse(callback, {});

			expect(callback.onFailure).toBeCalledWith(err);

			callback.onFailure.mockClear();

			spyon.mockClear();
		});

		test('Client request RespondToAuthChallenge - getPasswordAuthenticationKey CryptoJS code runs smoothly', () => {
			const spyon = jest
				.spyOn(AuthenticationHelper.prototype, 'getPasswordAuthenticationKey')
				.mockImplementation((...args) => {
					args[4](null, 'hkdf value');
				});

			const spyon2 = jest.spyOn(user, 'getUserContextData');

			user.getDeviceResponse(callback, {});

			expect(spyon2).toBeCalled();

			callback.onFailure.mockClear();

			spyon.mockClear();
			spyon2.mockClear();
		});

		test('Client request RespondToAuthChallenge nested client fails gracefully', () => {
			const err = new Error('RespondToAuthChallenge nested Client error');

			const spyon = jest
				.spyOn(Client.prototype, 'request')
				.mockImplementation((...args) => {
					args[2](err, {});
				});

			user.getDeviceResponse(callback, {});

			expect(callback.onFailure).toBeCalledWith(err);

			callback.onFailure.mockClear();
			spyon.mockClear();
		});

		test('Client request RespondToAuthChallenge nested client calls success callbacks', () => {
			const spyon = jest.spyOn(user, 'getCognitoUserSession');
			const spyon2 = jest.spyOn(user, 'cacheTokens');

			user.getDeviceResponse(callback, {});

			expect(spyon).toBeCalledTimes(1);
			expect(spyon2).toBeCalledTimes(1);
			expect(callback.onSuccess).toBeCalledWith(user.signInUserSession);

			callback.onSuccess.mockClear();
			spyon.mockClear();
			spyon2.mockClear();
		});
	});
});

describe('confirmRegistration()', () => {
	const user = new CognitoUser({ ...userDefaults });
	const callback = jest.fn();
	let [confirmationCode, forceAliasCreation] = ['abc123', true];
	const clientMetadata = { meta1: 'value 1', meta2: 'value 2' };

	test('ConfirmSignUp fails gracefully', () => {
		const err = new Error('ConfirmSignUp');
		const spyon = jest
			.spyOn(Client.prototype, 'request')
			.mockImplementation((...args) => {
				args[2](err);
			});
		const spyon2 = jest.spyOn(user, 'getUserContextData');
		user.confirmRegistration(
			confirmationCode,
			forceAliasCreation,
			callback,
			clientMetadata
		);

		expect(spyon).toBeCalled();
		expect(spyon2).toBeCalled();
		expect(callback).toBeCalledWith(err, null);

		spyon.mockClear();
		spyon2.mockClear();
		callback.mockClear();
	});

	test('ConfirmSignUp returns SUCCESS', () => {
		const spyon = jest
			.spyOn(Client.prototype, 'request')
			.mockImplementation((...args) => {
				args[2](null);
			});

		const spyon2 = jest.spyOn(user, 'getUserContextData');
		user.confirmRegistration(
			confirmationCode,
			forceAliasCreation,
			callback,
			clientMetadata
		);

		expect(spyon2).toBeCalled();
		expect(callback).toBeCalledWith(null, 'SUCCESS');

		spyon.mockClear();
		spyon2.mockClear();
		callback.mockClear();
	});
});

describe('sendCustomChallengeAnswer()', () => {
	const user = new CognitoUser({ ...userDefaults });
	const callback = {
		onSuccess: jest.fn(),
		onFailure: jest.fn(),
	};
	let answerChallenge = 'the answer';
	let clientMetadata = { meta1: 'value 1', meta2: 'value2' };

	user.Session = vCognitoUserSession;
	Object.assign(vCognitoUserSession, {
		AuthenticationResult: {
			NewDeviceMetadata: {
				DeviceGroupKey: 'abc123',
				DeviceKey: '123abc',
			},
		},
		ChallengeName: 'random challenge',
	});

	test('send custom challenge happy path', () => {
		const spyon = jest
			.spyOn(Client.prototype, 'request')
			.mockImplementation((...args) => {
				args[2](null, vCognitoUserSession);
			});

		const spyon2 = jest.spyOn(user, 'getCachedDeviceKeyAndPassword');
		const spyon3 = jest.spyOn(user, 'authenticateUserInternal');

		user.sendCustomChallengeAnswer(answerChallenge, callback, clientMetadata);

		expect(spyon2).toBeCalledTimes(1);
		expect(spyon3).toBeCalled();

		spyon.mockClear();
		spyon2.mockClear();
		spyon3.mockClear();
	});

	test('send custom challenge fails gracefully', () => {
		const err = new Error('RespondToAuthChallenge error.');
		const spyon = jest
			.spyOn(Client.prototype, 'request')
			.mockImplementation((...args) => {
				args[2](err, vCognitoUserSession);
			});

		user.sendCustomChallengeAnswer(answerChallenge, callback, clientMetadata);

		expect(callback.onFailure).toBeCalledWith(err);

		spyon.mockClear();
	});
});

describe('sendMFACode()', () => {
	const user = new CognitoUser({ ...userDefaults });
	const confirmationCode = 'abc123';
	const callback = {
		onFailure: jest.fn(),
	};
	let mfaType;
	const clientMetadata = { meta1: 'value 1', meta2: 'value 2' };

	test('sendMFACode gets initialized properly', () => {
		const spyon = jest.spyOn(user, 'getUserContextData');

		user.sendMFACode(confirmationCode, callback, mfaType, clientMetadata);

		expect(spyon).toHaveBeenCalled();

		spyon.mockClear();
	});
});

describe('verifySoftwareToken()', () => {
	const cognitoUser = new CognitoUser({ ...userDefaults });

	const callback = {
		onSuccess: jest.fn(),
		onFailure: jest.fn(),
	};
	afterEach(() => {
		callback.onSuccess.mockClear();
		callback.onFailure.mockClear();
	});

	afterAll(() => {
		jest.restoreAllMocks();
	});

	test('happy case should callback onSuccess with the token', () => {
		netRequestMockSuccess(true);
		netRequestMockSuccess(true);

		cognitoUser.verifySoftwareToken(totpCode, deviceName, callback);
		expect(callback.onSuccess.mock.calls.length).toBe(1);
	});

	test('Verify software token first callback fails', () => {
		netRequestMockSuccess(false);
		cognitoUser.verifySoftwareToken(totpCode, deviceName, callback);
		expect(callback.onFailure.mock.calls.length).toBe(1);
	});

	test('Verify Software Token second callback fails', () => {
		netRequestMockSuccess(true);
		netRequestMockSuccess(false);

		cognitoUser.verifySoftwareToken(totpCode, deviceName, callback);
		expect(callback.onFailure.mock.calls.length).toBe(1);
	});

	test('Happy case for signed in user session', () => {
		cognitoUser.setSignInUserSession(vCognitoUserSession);
		netRequestMockSuccess(true);
		cognitoUser.verifySoftwareToken(totpCode, deviceName, callback);
		expect(callback.onSuccess.mock.calls.length).toBe(1);
	});

	test('Error case for non-signed in user session', () => {
		netRequestMockSuccess(false);
		cognitoUser.verifySoftwareToken(totpCode, deviceName, callback);
		expect(callback.onFailure.mock.calls.length).toBe(1);
	});
});

describe('associateSoftwareToken()', () => {
	const cognitoUser = new CognitoUser({ ...userDefaults });

	const callback = {
		associateSecretCode: jest.fn(),
		onFailure: jest.fn(),
	};

	afterAll(() => {
		jest.restoreAllMocks();
	});

	afterEach(() => {
		callback.associateSecretCode.mockClear();
		callback.onFailure.mockClear();
	});

	test('Happy path for associate software token without a userSession ', () => {
		netRequestMockSuccess(true);
		cognitoUser.associateSoftwareToken(callback);
		expect(callback.associateSecretCode.mock.calls.length).toBe(1);
	});

	test('Failing in the first requeset to client', () => {
		netRequestMockSuccess(false);
		cognitoUser.associateSoftwareToken(callback);
		expect(callback.onFailure.mock.calls.length).toBe(1);
	});
	test('Happy path for a user with a validUserSession ', () => {
		netRequestMockSuccess(true);
		cognitoUser.setSignInUserSession(vCognitoUserSession);
		cognitoUser.associateSoftwareToken(callback);
		expect(callback.associateSecretCode.mock.calls.length).toBe(1);
	});
	test('Error path for a user with a validUserSession ', () => {
		netRequestMockSuccess(false);
		cognitoUser.associateSoftwareToken(callback);
		expect(callback.onFailure.mock.calls.length).toBe(1);
	});
});

describe('sendMFASelectionAnswer()', () => {
	const cognitoUser = new CognitoUser({ ...userDefaults });

	const callback = {
		mfaRequired: jest.fn(),
		onFailure: jest.fn(),
		totpRequired: jest.fn(),
	};

	afterAll(() => {
		jest.restoreAllMocks();
	});

	test('happy case with SMS_MFA', () => {
		netRequestMockSuccess(true, { Session: 'sessionData' });
		cognitoUser.sendMFASelectionAnswer('SMS_MFA', callback);
		expect(callback.mfaRequired.mock.calls.length).toEqual(1);
	});

	test('happy case with software token MFA', () => {
		netRequestMockSuccess(true, { Session: 'sessionData' });
		cognitoUser.sendMFASelectionAnswer('SOFTWARE_TOKEN_MFA', callback);
		expect(callback.totpRequired.mock.calls.length).toEqual(1);
	});

	test('error case with software token MFA', () => {
		netRequestMockSuccess(false);
		cognitoUser.sendMFASelectionAnswer('SOFTWARE_TOKEN_MFA', callback);
		expect(callback.onFailure.mock.calls.length).toEqual(1);
	});
	test('error case with undefined answer challenge', () => {
		netRequestMockSuccess(true, { Session: 'sessionData' });
		const res = cognitoUser.sendMFASelectionAnswer('WRONG_CHALLENGE', callback);
		expect(res).toEqual(undefined);
	});
});

describe('signOut() and globalSignOut', () => {
	const cognitoUser = new CognitoUser({ ...userDefaults });

	const callback = {
		onSuccess: jest.fn(),
		onFailure: jest.fn(),
	};
	afterAll(() => {
		jest.restoreAllMocks();
	});

	afterEach(() => {
		callback.onSuccess.mockClear();
		callback.onFailure.mockClear();
	});

	test('signOut expected to set signinUserSession to equal null', () => {
		cognitoUser.signOut();
		expect(cognitoUser.signInUserSession).toEqual(null);
	});

	test('global signOut Happy Path', () => {
		netRequestMockSuccess(true);
		cognitoUser.setSignInUserSession(vCognitoUserSession);
		cognitoUser.globalSignOut(callback);
		expect(callback.onSuccess.mock.calls.length).toEqual(1);
	});

	test('global signOut catching an error', () => {
		netRequestMockSuccess(false);
		cognitoUser.globalSignOut(callback);
		expect(callback.onFailure.mock.calls.length).toEqual(1);
	});

	test('Global signout when user session is null', () => {
		cognitoUser.setSignInUserSession(ivCognitoUserSession);
		cognitoUser.globalSignOut(callback);
		expect(callback.onFailure.mock.calls.length).toEqual(1);
	});
});

describe('listDevices', () => {
	const cognitoUser = new CognitoUser({ ...userDefaults });

	const callback = {
		onSuccess: jest.fn(),
		onFailure: jest.fn(),
	};

	afterAll(() => {
		jest.restoreAllMocks();
	});

	afterEach(() => {
		callback.onSuccess.mockClear();
		callback.onFailure.mockClear();
	});
	cognitoUser.setSignInUserSession(vCognitoUserSession);

	test('Happy path for device list', () => {
		netRequestMockSuccess(true, ['deviceName', 'device2Name']);
		cognitoUser.listDevices(1, 'paginationToken', callback);
		expect(callback.onSuccess.mock.calls.length).toEqual(1);
	});

	test('Client request throws an error', () => {
		netRequestMockSuccess(false);
		cognitoUser.listDevices(1, null, callback);
		expect(callback.onFailure.mock.calls.length).toEqual(1);
	});
	test('Invalid userSession throws an error', () => {
		cognitoUser.setSignInUserSession(ivCognitoUserSession);
		cognitoUser.listDevices(1, null, callback);
		expect(callback.onFailure.mock.calls.length).toEqual(1);
	});
});

describe('setDeviceStatus[remembered,notRemembered]()', () => {
	const cognitoUser = new CognitoUser({ ...userDefaults });
	cognitoUser.setSignInUserSession(vCognitoUserSession);
	const callback = {
		onSuccess: jest.fn(),
		onFailure: jest.fn(),
	};

	afterAll(() => {
		jest.restoreAllMocks();
	});

	afterEach(() => {
		callback.onSuccess.mockClear();
		callback.onFailure.mockClear();
	});

	test('Happy path should callback success', () => {
		netRequestMockSuccess(true);
		cognitoUser.setDeviceStatusNotRemembered(callback);
		expect(callback.onSuccess.mock.calls.length).toEqual(1);
	});

	test('Callback catches an error from client request', () => {
		netRequestMockSuccess(false);
		cognitoUser.setDeviceStatusNotRemembered(callback);
		expect(callback.onFailure.mock.calls.length).toEqual(1);
	});

	test('Client request does not work and method returns undefined', () => {
		cognitoUser.setSignInUserSession(vCognitoUserSession);
		expect(cognitoUser.setDeviceStatusNotRemembered(callback)).toEqual(
			undefined
		);
	});

	test('Happy path for setDeviceStatusRemembered should callback with onSuccess ', () => {
		netRequestMockSuccess(true);
		cognitoUser.setDeviceStatusRemembered(callback);
		expect(callback.onSuccess.mock.calls.length).toEqual(1);
	});

	test('Client throws and error should callback onFailure', () => {
		netRequestMockSuccess(false);
		cognitoUser.setDeviceStatusRemembered(callback);
		expect(callback.onFailure.mock.calls.length).toEqual(1);
	});

	test('Client request does not work and method returns undefined', () => {
		expect(cognitoUser.setDeviceStatusRemembered(callback)).toEqual(undefined);
	});

	test('Invalid user session throws an error', () => {
		cognitoUser.setSignInUserSession(ivCognitoUserSession);
		cognitoUser.setDeviceStatusNotRemembered(callback);
		expect(callback.onFailure.mock.calls.length).toEqual(1);
	});

	test('Invalid user session throws an error', () => {
		cognitoUser.setDeviceStatusRemembered(callback);
		expect(callback.onFailure.mock.calls.length).toEqual(1);
	});
});

describe('forgetDevices()', () => {
	const cognitoUser = new CognitoUser({ ...userDefaults });
	cognitoUser.setSignInUserSession(vCognitoUserSession);
	const callback = {
		onSuccess: jest.fn(),
		onFailure: jest.fn(),
	};

	afterAll(() => {
		jest.restoreAllMocks();
	});

	afterEach(() => {
		callback.onSuccess.mockClear();
		callback.onFailure.mockClear();
	});

	test('Forget specific device happy path should callback onSuccess', () => {
		netRequestMockSuccess(true);
		cognitoUser.forgetSpecificDevice('deviceKey', callback);
		expect(callback.onSuccess.mock.calls.length).toEqual(1);
	});
	test('Client request throws an error for forget specific device', () => {
		netRequestMockSuccess(false);
		cognitoUser.forgetSpecificDevice('deviceKey', callback);
		expect(callback.onFailure.mock.calls.length).toEqual(1);
	});

	test('Returns undefined when client request does not work properly', () => {
		expect(cognitoUser.forgetSpecificDevice('deviceKey', callback)).toEqual(
			undefined
		);
	});
	test('forgetSpecificDevice happy path should callback onSuccess', () => {
		netRequestMockSuccess(true);
		cognitoUser.forgetDevice(callback);
		expect(callback.onSuccess.mock.calls.length).toEqual(1);
	});
	test('Invalid user session throws and error for forget specific device', () => {
		cognitoUser.setSignInUserSession(ivCognitoUserSession);
		cognitoUser.forgetSpecificDevice('deviceKey', callback);
		expect(callback.onFailure.mock.calls.length).toEqual(1);
	});
});

describe('getDevice()', () => {
	const cognitoUser = new CognitoUser({ ...userDefaults });
	cognitoUser.setSignInUserSession(vCognitoUserSession);
	const callback = {
		onSuccess: jest.fn(),
		onFailure: jest.fn(),
	};

	afterAll(() => {
		jest.restoreAllMocks();
	});

	afterEach(() => {
		callback.onSuccess.mockClear();
		callback.onFailure.mockClear();
	});

	test('Happy path for getDevice should callback onSuccess', () => {
		netRequestMockSuccess(true);
		cognitoUser.getDevice(callback);
		expect(callback.onSuccess.mock.calls.length).toEqual(1);
	});

	test('client request returns an error and onFailure is called', () => {
		netRequestMockSuccess(false);
		cognitoUser.getDevice(callback);
		expect(callback.onFailure.mock.calls.length).toEqual(1);
	});

	test('No client request method implementations, return undefined', () => {
		expect(cognitoUser.getDevice(callback)).toEqual(undefined);
	});

	test('invalid user session should callback onFailure', () => {
		cognitoUser.setSignInUserSession(ivCognitoUserSession);
		cognitoUser.getDevice(callback);
		expect(callback.onFailure.mock.calls.length).toEqual(1);
	});
});

describe('verifyAttribute(), getAttributeVerificationCode', () => {
	const cognitoUser = new CognitoUser({ ...userDefaults });
	cognitoUser.setSignInUserSession(vCognitoUserSession);
	const callback = {
		onSuccess: jest.fn(),
		onFailure: jest.fn(),
		inputVerificationCode: jest.fn(),
	};
	const verifyAttributeDefaults = ['username', '123456', callback];

	afterAll(() => {
		jest.restoreAllMocks();
	});

	afterEach(() => {
		callback.onSuccess.mockClear();
		callback.onFailure.mockClear();
		callback.inputVerificationCode.mockClear();
	});

	test('Happy path for verifyAttribute should callback onSuccess', () => {
		netRequestMockSuccess(true);
		cognitoUser.verifyAttribute(...verifyAttributeDefaults);
		expect(callback.onSuccess.mock.calls.length).toEqual(1);
	});

	test('client request returns an error and onFailure is called', () => {
		netRequestMockSuccess(false);
		cognitoUser.verifyAttribute(...verifyAttributeDefaults);
		expect(callback.onFailure.mock.calls.length).toEqual(1);
	});

	test('No client request method implementations, return undefined', () => {
		expect(cognitoUser.verifyAttribute(...verifyAttributeDefaults)).toEqual(
			undefined
		);
	});

	const getAttrsVerifCodeDefaults = ['username', callback, {}];
	test('happy path for getAttributeVerificationCode', () => {
		//callback.inputVerification needs to be set to null before the call to avoid the conditional in the method.
		callback.inputVerificationCode = null;

		netRequestMockSuccess(true);
		cognitoUser.getAttributeVerificationCode(...getAttrsVerifCodeDefaults);
		callback.inputVerificationCode = jest.fn();
		expect(callback.onSuccess.mock.calls.length).toEqual(1);
	});

	test('when inputVerificationCode exists in the callback, call inputVerifier with the data', () => {
		netRequestMockSuccess(true);
		cognitoUser.getAttributeVerificationCode(...getAttrsVerifCodeDefaults);
		expect(callback.inputVerificationCode.mock.calls.length).toEqual(1);
	});

	test('when inputVerificationCode exists in the callback, call inputVerifier with the data', () => {
		netRequestMockSuccess(false);

		cognitoUser.getAttributeVerificationCode(...getAttrsVerifCodeDefaults);
		expect(callback.onFailure.mock.calls.length).toEqual(1);
	});

	test('invalid user session should callback onFailure for verifyAttributes', () => {
		cognitoUser.setSignInUserSession(ivCognitoUserSession);
		cognitoUser.verifyAttribute(...verifyAttributeDefaults);
		expect(callback.onFailure.mock.calls.length).toEqual(1);
	});

	test('invalid user session should callback onFailure for getAttrsVerifCodeDefaults', () => {
		cognitoUser.getAttributeVerificationCode(...getAttrsVerifCodeDefaults);
		expect(callback.onFailure.mock.calls.length).toEqual(1);
	});
});

describe('confirmPassword() and forgotPassword()', () => {
	const cognitoUser = new CognitoUser({ ...userDefaults });
	cognitoUser.setSignInUserSession(vCognitoUserSession);
	const callback = {
		onSuccess: jest.fn(),
		onFailure: jest.fn(),
	};
	const confirmPasswordDefaults = [
		'confirmCode',
		'newSecurePassword',
		callback,
		{},
	];
	const forgotPasswordDefaults = [callback, {}];

	afterAll(() => {
		jest.restoreAllMocks();
	});

	afterEach(() => {
		callback.onSuccess.mockClear();
		callback.onFailure.mockClear();
	});

	test('happy path should callback onSuccess', () => {
		netRequestMockSuccess(true);
		cognitoUser.confirmPassword(...confirmPasswordDefaults);
		expect(callback.onSuccess.mock.calls.length).toEqual(1);
	});

	test('client request throws an error', () => {
		netRequestMockSuccess(false);
		cognitoUser.confirmPassword(...confirmPasswordDefaults);
		expect(callback.onFailure.mock.calls.length).toEqual(1);
	});

	test('happy path should callback onSuccess', () => {
		netRequestMockSuccess(true);
		cognitoUser.forgotPassword(...forgotPasswordDefaults);
		expect(callback.onSuccess.mock.calls.length).toEqual(1);
	});

	test('inputVerification code is a function should callback inputVerificationCode', () => {
		callback.inputVerificationCode = jest.fn();
		netRequestMockSuccess(true);
		cognitoUser.forgotPassword(...forgotPasswordDefaults);
		expect(callback.inputVerificationCode.mock.calls.length).toEqual(1);
	});

	test('client returning an error should call onFailure', () => {
		netRequestMockSuccess(false);
		cognitoUser.forgotPassword(...forgotPasswordDefaults);
		expect(callback.onFailure.mock.calls.length).toEqual(1);
	});
});

describe('MFA test suite', () => {
	const cognitoUser = new CognitoUser({ ...userDefaults });
	cognitoUser.setSignInUserSession(vCognitoUserSession);
	const callback = {
		onSuccess: jest.fn(),
		onFailure: jest.fn(),
	};

	const sendMfaDefaults = ['abc123', callback, 'SMS_MFA', {}];

	afterAll(() => {
		jest.restoreAllMocks();
	});

	afterEach(() => {
		callback.onSuccess.mockClear();
		callback.onFailure.mockClear();
	});

	const payload = {
		ChallengeName: 'SMS_MFA',
		AuthenticationResult: { NewDeviceMetadata: 'deviceMetaData' },
	};

	/** sendMFA()  */
	test('Happy path for sendMFACode should call onSuccess', () => {
		netRequestMockSuccess(true, payload);
		authHelperMock(genHashDevices);
		authHelperMock(getSalt);
		authHelperMock(getVerifiers);
		netRequestMockSuccess(true, { UserConfirmationNecessary: false });
		cognitoUser.sendMFACode(...sendMfaDefaults);
		expect(callback.onSuccess.mock.calls.length).toEqual(1);
	});

	test('when userConfirmation is true, should callback onSuccess', () => {
		netRequestMockSuccess(true, payload);
		authHelperMock(genHashDevices);
		authHelperMock(getSalt);
		authHelperMock(getVerifiers);
		netRequestMockSuccess(true, { UserConfirmationNecessary: true });
		cognitoUser.sendMFACode(...sendMfaDefaults);
		expect(callback.onSuccess.mock.calls.length).toEqual(1);
	});

	test('second client request fails so sendMFACode should call onFailure', () => {
		netRequestMockSuccess(true, payload);
		authHelperMock(genHashDevices);
		authHelperMock(getSalt);
		authHelperMock(getVerifiers);
		netRequestMockSuccess(false);
		cognitoUser.sendMFACode(...sendMfaDefaults);
		expect(callback.onFailure.mock.calls.length).toEqual(1);
	});

	test('when generateHashDevice fails, sendMFACode should call onFailure', () => {
		netRequestMockSuccess(true, payload);
		jest
			.spyOn(AuthenticationHelper.prototype, 'generateHashDevice')
			.mockImplementationOnce((...args) => {
				args[2](new Error('Network Error'), null);
			});
		cognitoUser.sendMFACode(...sendMfaDefaults);
		expect(callback.onFailure.mock.calls.length).toEqual(1);
	});

	test('when AuthenticationResult.NewDeviceMetadata == null, callback onSuccess', () => {
		jest
			.spyOn(Client.prototype, 'request')
			.mockImplementationOnce((...args) => {
				args[2](null, {
					ChallengeName: 'SMS_MFA',
					AuthenticationResult: { NewDeviceMetadata: null },
				});
			});

		cognitoUser.sendMFACode(...sendMfaDefaults);
		expect(callback.onSuccess.mock.calls.length).toEqual(1);
	});

	test('first network request throws an error calls onFailure', () => {
		netRequestMockSuccess(false);
		cognitoUser.sendMFACode(...sendMfaDefaults);
		expect(callback.onFailure.mock.calls.length).toEqual(1);
	});

	test('first client request does not exist so sendMFACode should return undefined', () => {
		expect(cognitoUser.sendMFACode(...sendMfaDefaults)).toEqual(undefined);
	});
});

describe('enableMFA()', () => {
	const cognitoUser = new CognitoUser({ ...userDefaults });
	cognitoUser.setSignInUserSession(vCognitoUserSession);
	const callback = jest.fn();

	afterAll(() => {
		jest.restoreAllMocks();
	});

	afterEach(() => {
		callback.mockClear();
	});

	test('enableMFA happy path should callback on success  ', () => {
		netRequestMockSuccess(true);
		cognitoUser.enableMFA(callback);
		expect(callback.mock.calls[0][1]).toEqual('SUCCESS');
	});

	test('enableMFA should have an error when client request fails', () => {
		netRequestMockSuccess(false);
		cognitoUser.enableMFA(callback);
		expect(callback.mock.calls[0][0]).toMatchObject(networkError);
	});

	test('enableMFA should return undefined when no client request is defined', () => {
		expect(cognitoUser.enableMFA(callback)).toEqual(undefined);
	});

	test('enableMFA should callback with an error when userSession is invalid', () => {
		cognitoUser.setSignInUserSession(ivCognitoUserSession);
		cognitoUser.enableMFA(callback);
		expect(callback.mock.calls[0][0]).toMatchObject(
			Error('User is not authenticated')
		);
	});
});

describe('setUserMfaPreference', () => {
	const cognitoUser = new CognitoUser({ ...userDefaults });
	cognitoUser.setSignInUserSession(vCognitoUserSession);
	const callback = jest.fn();

	const setUserMfaPreferenceDefaults = [
		'smsMFASetting',
		'swTokenMFASetting',
		callback,
	];

	afterAll(() => {
		jest.restoreAllMocks();
	});

	afterEach(() => {
		callback.mockClear();
	});
	test('happy path for setUserMfaPreferences should callback(null,SUCCESS)', () => {
		netRequestMockSuccess(true);
		cognitoUser.setUserMfaPreference(...setUserMfaPreferenceDefaults);
		expect(callback.mock.calls[0][1]).toEqual('SUCCESS');
	});
	test('client request throws an error path for setUserMfaPreferences should callback(null,SUCCESS)', () => {
		netRequestMockSuccess(false);
		cognitoUser.setUserMfaPreference(...setUserMfaPreferenceDefaults);
		expect(callback.mock.calls[0][0]).toMatchObject(Error('Network Error'));
	});

	test('happy path for setUserMfaPreferences should callback(null,SUCCESS)', () => {
		expect(
			cognitoUser.setUserMfaPreference(...setUserMfaPreferenceDefaults)
		).toEqual(undefined);
	});

	test('should callback error when cognito user session is invalid', () => {
		cognitoUser.setSignInUserSession(ivCognitoUserSession);
		cognitoUser.setUserMfaPreference(...setUserMfaPreferenceDefaults);
		expect(callback.mock.calls[0][0]).toMatchObject(
			new Error('User is not authenticated')
		);
	});
});

describe('disableMFA()', () => {
	const cognitoUser = new CognitoUser({ ...userDefaults });
	cognitoUser.setSignInUserSession(vCognitoUserSession);
	const callback = jest.fn();

	afterAll(() => {
		jest.restoreAllMocks();
	});

	afterEach(() => {
		callback.mockClear();
	});

	test('happy path should callback with (null, SUCCESS)', () => {
		netRequestMockSuccess(true);
		cognitoUser.disableMFA(callback);
		expect(callback.mock.calls[0][1]).toEqual('SUCCESS');
	});
	test('client request throws an error and should callback with (err, null)', () => {
		netRequestMockSuccess(false);
		cognitoUser.disableMFA(callback);
		expect(callback.mock.calls[0][0]).toMatchObject(new Error('Network Error'));
	});

	test('client request does not exist and disableMFA should callback with (err, null)', () => {
		expect(cognitoUser.disableMFA(callback)).toEqual(undefined);
	});

	test('when user is invalid, return callback with error', () => {
		cognitoUser.setSignInUserSession(ivCognitoUserSession);
		cognitoUser.disableMFA(callback);
		expect(callback.mock.calls[0][0]).toMatchObject(
			new Error('User is not authenticated')
		);
	});
});

describe('getMFAOptions()', () => {
	const cognitoUser = new CognitoUser({ ...userDefaults });
	cognitoUser.setSignInUserSession(vCognitoUserSession);
	const callback = jest.fn();

	afterAll(() => {
		jest.restoreAllMocks();
	});

	afterEach(() => {
		callback.mockClear();
	});

	test('happy path for getMFAOptions should callback onSuccess', () => {
		netRequestMockSuccess(true, { MFAOptions: 'SMS_MFA' });
		cognitoUser.getMFAOptions(callback);
		expect(callback.mock.calls[0][1]).toEqual('SMS_MFA');
	});
	test('client request throws an error and should callback with (err, null)', () => {
		netRequestMockSuccess(false);
		cognitoUser.getMFAOptions(callback);
		expect(callback.mock.calls[0][0]).toMatchObject(new Error('Network Error'));
	});

	test('when user is invalid, return callback with error', () => {
		cognitoUser.setSignInUserSession(ivCognitoUserSession);
		cognitoUser.getMFAOptions(callback);
		expect(callback.mock.calls[0][0]).toMatchObject(
			new Error('User is not authenticated')
		);
	});
});

describe('deleteUser()', () => {
	const cognitoUser = new CognitoUser({ ...userDefaults });
	cognitoUser.setSignInUserSession(vCognitoUserSession);
	const callback = jest.fn();

	afterAll(() => {
		jest.restoreAllMocks();
	});

	afterEach(() => {
		callback.mockClear();
	});

	test('happy path should callback SUCCESS', () => {
		netRequestMockSuccess(true, null);
		cognitoUser.deleteUser(callback, {});
		expect(callback.mock.calls[0][1]).toEqual('SUCCESS');
	});

	test('client request throws an error', () => {
		netRequestMockSuccess(false);
		cognitoUser.deleteUser(callback, {});
		expect(callback.mock.calls[0][0]).toMatchObject(new Error('Network Error'));
	});

	test('having an invalid user session should callback with a new error', () => {
		cognitoUser.setSignInUserSession(ivCognitoUserSession);
		cognitoUser.deleteUser(callback, {});
		expect(callback.mock.calls[0][0]).toMatchObject(
			new Error('User is not authenticated')
		);
	});
});

describe('getUserAttributes()', () => {
	const cognitoUser = new CognitoUser({ ...userDefaults });
	cognitoUser.setSignInUserSession(vCognitoUserSession);
	const callback = jest.fn();

	afterAll(() => {
		jest.restoreAllMocks();
	});

	afterEach(() => {
		callback.mockClear();
	});

	test('happy path for getUserAttributes', () => {
		const userAttributesObject = {
			UserAttributes: [{ Name: 'name1', Value: 'value1' }],
		};
		netRequestMockSuccess(true, userAttributesObject);
		cognitoUser.getUserAttributes(callback);
		expect(callback.mock.calls[0][1]).toMatchObject(
			userAttributesObject.UserAttributes
		);
	});

	test('client request throws an error', () => {
		netRequestMockSuccess(false);
		cognitoUser.getUserAttributes(callback);
		expect(callback.mock.calls[0][0]).toMatchObject(new Error('Network Error'));
	});

	test('having an invalid user session should callback with a new error', () => {
		cognitoUser.setSignInUserSession(ivCognitoUserSession);
		cognitoUser.getUserAttributes(callback);
		expect(callback.mock.calls[0][0]).toMatchObject(
			new Error('User is not authenticated')
		);
	});
});

describe('getCognitoUserSession()', () => {
	const cognitoUser = new CognitoUser({ ...userDefaults });

	const idToken = new CognitoIdToken();
	const accessToken = new CognitoAccessToken();
	const refreshToken = new CognitoRefreshToken();

	const sessionData = {
		IdToken: idToken,
		AccessToken: accessToken,
		RefreshToken: refreshToken,
	};
	cognitoUser.setSignInUserSession(vCognitoUserSession);
	test('happy path should return a new CognitoUserSession', () => {
		expect(cognitoUser.getCognitoUserSession({})).toMatchObject(
			new CognitoUserSession(sessionData)
		);
	});
});

describe('refreshSession()', () => {
	const cognitoUser = new CognitoUser({ ...userDefaults });
	const callback = jest.fn();
	const refreshSessionDefaults = [new CognitoRefreshToken(), callback, {}];

	const idToken = new CognitoIdToken();
	const accessToken = new CognitoAccessToken();
	const refreshToken = new CognitoRefreshToken();
	const sessionData = {
		IdToken: idToken,
		AccessToken: accessToken,
		RefreshToken: refreshToken,
	};

	afterAll(() => {
		jest.restoreAllMocks();
	});

	afterEach(() => {
		callback.mockClear();
	});

	test('happy path for refresh session ', () => {
		netRequestMockSuccess(true, {
			AuthenticationResult: { RefreshToken: null },
		});
		cognitoUser.refreshSession(...refreshSessionDefaults);
		expect(callback.mock.calls[0][1]).toMatchObject(
			new CognitoUserSession(sessionData)
		);
	});
	test('client throws an error ', () => {
		netRequestMockSuccess(false);
		cognitoUser.refreshSession(...refreshSessionDefaults);
		expect(callback.mock.calls[0][0]).toMatchObject(new Error('Network Error'));
	});

	describe('getSession()', () => {
		const cognitoUser = new CognitoUser({ ...userDefaults });
		const callback = jest.fn();

		const idToken = new CognitoIdToken();
		const accessToken = new CognitoAccessToken();
		const refreshToken = new CognitoRefreshToken();
		const sessionData = {
			IdToken: idToken,
			AccessToken: accessToken,
			RefreshToken: refreshToken,
		};
		const testSession = new CognitoUserSession(sessionData);

		afterAll(() => {
			jest.restoreAllMocks();
		});

		afterEach(() => {
			callback.mockClear();
		});

		const keyPrefix = `CognitoIdentityServiceProvider.${cognitoUser.pool.getClientId()}.${
			cognitoUser.username
		}`;

		const idTokenKey = `${keyPrefix}.idToken`;
		const accessTokenKey = `${keyPrefix}.accessToken`;
		const refreshTokenKey = `${keyPrefix}.refreshToken`;
		const clockDriftKey = `${keyPrefix}.clockDrift`;

		test('when an invalid userSession exists, get signinUserSession from cache', () => {
			cognitoUser.setSignInUserSession(ivCognitoUserSession);
			cognitoUser.storage.setItem(
				idTokenKey,
				vCognitoUserSession.getIdToken().getJwtToken()
			);
			cognitoUser.storage.setItem(
				accessTokenKey,
				vCognitoUserSession.getAccessToken().getJwtToken()
			);
			cognitoUser.storage.setItem(
				refreshTokenKey,
				vCognitoUserSession.getRefreshToken().getToken()
			);
			cognitoUser.storage.setItem(
				clockDriftKey,
				vCognitoUserSession.getClockDrift()
			);
			cognitoUser.getSession(callback);
			expect(callback.mock.calls[0][0]).toEqual(null);
		});

		test('when a valid userSession exists, return callback(null, signInUserSession) from instance vars', () => {
			cognitoUser.setSignInUserSession(vCognitoUserSession);
			cognitoUser.getSession(callback);
			expect(callback.mock.calls[0][1]).toMatchObject(
				cognitoUser.signInUserSession
			);
		});
		test('when a username is null, callback with an error', () => {
			cognitoUser.username = null;
			cognitoUser.getSession(callback);
			expect(callback.mock.calls[0][0]).toMatchObject(
				new Error('Username is null. Cannot retrieve a new session')
			);
		});
	});
});
