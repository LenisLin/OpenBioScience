import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import DeepScientistLogo from '@renderer/components/icons/DeepScientistLogo';
import DeepScientistWordmark from '@renderer/components/icons/DeepScientistWordmark';
import AppLoader from '@renderer/components/layout/AppLoader';
import FeishuConnectionWizardModal from '@/renderer/pages/collaboration/FeishuConnectionWizardModal';
import { getCollaborationModule } from '@/renderer/pages/collaboration/collaborationConfig';
import LoginResearchGlobe from '../login/components/LoginResearchGlobe';
import { useAuth } from '../../hooks/context/AuthContext';
import '../login/LoginPage.css';

type RegisterStep = 'account' | 'collaboration' | 'ready';
type MessageState = {
  type: 'error' | 'success';
  text: string;
};

const REMEMBER_ME_KEY = 'rememberMe';
const REMEMBERED_USERNAME_KEY = 'rememberedUsername';
const REMEMBERED_PASSWORD_KEY = 'rememberedPassword';
const REGISTERED_ACCOUNT_KEY = 'deepscientist.localRegisteredAccount';
const AUTO_FOCUS_QUERY = '(min-width: 721px)';

const obfuscate = (text: string): string => {
  const encoded = btoa(encodeURIComponent(text));
  return encoded.split('').toReversed().join('');
};

const resetAuthPageScroll = (): void => {
  const root = document.getElementById('root');
  root?.scrollTo({ left: 0, top: 0 });
  window.scrollTo({ left: 0, top: 0 });

  if (document.scrollingElement) {
    document.scrollingElement.scrollTop = 0;
    document.scrollingElement.scrollLeft = 0;
  }
};

const RegisterPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { status, login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [message, setMessage] = useState<MessageState | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<RegisterStep>('account');
  const [wizardVisible, setWizardVisible] = useState(false);
  const [selectedHubId, setSelectedHubId] = useState('westlake');

  const usernameRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const messageTimer = useRef<number | undefined>(undefined);

  const loginUrl = useMemo(() => getCollaborationModule('messages').url, []);

  useLayoutEffect(() => {
    document.documentElement.classList.add('login-page-active-root');
    document.body.classList.add('login-page-active');
    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';

    resetAuthPageScroll();
    const animationFrame = window.requestAnimationFrame(resetAuthPageScroll);
    const scrollResetTimer = window.setTimeout(resetAuthPageScroll, 120);

    return () => {
      document.documentElement.classList.remove('login-page-active-root');
      document.body.classList.remove('login-page-active');
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(scrollResetTimer);
      window.history.scrollRestoration = previousScrollRestoration;
      if (messageTimer.current) {
        window.clearTimeout(messageTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    document.title = 'DeepOrganiser - 注册';
  }, []);

  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  useEffect(() => {
    window.setTimeout(() => {
      if (window.matchMedia(AUTO_FOCUS_QUERY).matches) {
        usernameRef.current?.focus({ preventScroll: true });
      }
      resetAuthPageScroll();
    }, 0);

    return () => {
      if (messageTimer.current) {
        window.clearTimeout(messageTimer.current);
      }
    };
  }, []);

  const clearMessageLater = useCallback(() => {
    if (messageTimer.current) {
      window.clearTimeout(messageTimer.current);
    }
    messageTimer.current = window.setTimeout(() => {
      setMessage((prev) => (prev?.type === 'success' ? prev : null));
    }, 5000);
  }, []);

  const showMessage = useCallback(
    (next: MessageState) => {
      setMessage(next);
      if (next.type === 'error') {
        clearMessageLater();
      }
    },
    [clearMessageLater]
  );

  const persistRegisteredAccount = useCallback((nextUsername: string, nextPassword: string) => {
    localStorage.setItem(REMEMBER_ME_KEY, 'true');
    localStorage.setItem(REMEMBERED_USERNAME_KEY, obfuscate(nextUsername));
    localStorage.setItem(REMEMBERED_PASSWORD_KEY, obfuscate(nextPassword));
    localStorage.setItem(
      REGISTERED_ACCOUNT_KEY,
      JSON.stringify({
        username: nextUsername,
        createdAt: Date.now(),
      })
    );
  }, []);

  const handleCreateAccount = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const trimmedUsername = username.trim();

      if (!trimmedUsername || !password) {
        showMessage({ type: 'error', text: '请填写用户名和密码' });
        return;
      }
      if (trimmedUsername.length < 2) {
        showMessage({ type: 'error', text: '用户名至少需要 2 个字符' });
        return;
      }
      if (password.length < 4) {
        showMessage({ type: 'error', text: '密码至少需要 4 个字符' });
        return;
      }

      setLoading(true);
      setMessage(null);
      persistRegisteredAccount(trimmedUsername, password);
      const result = await login({ username: trimmedUsername, password, remember: true });
      setLoading(false);

      if (!result.success) {
        showMessage({ type: 'error', text: result.message || '注册失败，请稍后重试' });
        return;
      }

      setStep('collaboration');
      showMessage({ type: 'success', text: '账号已创建。现在可以连接飞书协作。' });
    },
    [login, password, persistRegisteredAccount, showMessage, username]
  );

  const handleOpenWizard = useCallback(() => {
    setWizardVisible(true);
  }, []);

  const handleWizardClose = useCallback(() => {
    setWizardVisible(false);
    setStep('ready');
    showMessage({ type: 'success', text: '飞书协作已连接，注册流程完成。' });
  }, [showMessage]);

  const handleWizardCancel = useCallback(() => {
    setWizardVisible(false);
  }, []);

  const handleSkipCollaboration = useCallback(() => {
    setStep('ready');
    showMessage({ type: 'success', text: '账号已准备好，稍后也可以在设置中连接飞书协作。' });
  }, [showMessage]);

  const handleEnterApp = useCallback(() => {
    void navigate('/guid', { replace: true });
  }, [navigate]);

  if (status === 'checking') {
    return <AppLoader />;
  }

  return (
    <div className='login-page register-page'>
      <div className='login-page__grid' aria-hidden='true' />
      <div className='login-page__axis login-page__axis--vertical' aria-hidden='true' />
      <div className='login-page__axis login-page__axis--horizontal' aria-hidden='true' />

      <header className='login-page__topbar'>
        <div className='login-page__identity'>
          <DeepScientistLogo
            aria-hidden='true'
            className='login-page__identity-logo-image'
            wrapperClassName='login-page__identity-logo'
          />
          <DeepScientistWordmark
            aria-label='DeepOrganiser'
            className='login-page__wordmark-image'
            wrapperClassName='login-page__wordmark'
          />
        </div>
        <span className='login-page__topbar-meta'>{t('login.sessionCode')}</span>
      </header>

      <main className='login-page__main' id='landing-main'>
        <section className='login-page__story' aria-labelledby='register-page-heading'>
          <div className='login-page__copy'>
            <span className='login-page__eyebrow'>RESEARCH ACCOUNT · Collaboration-ready</span>
            <h1 id='register-page-heading' className='login-page__title'>
              创建账号，把协作入口一次接好。
            </h1>
            <p className='login-page__subtitle'>只保留用户名和密码。需要多人协作时，注册后直接连接飞书。</p>
          </div>

          <div className='login-page__globe-shell'>
            <LoginResearchGlobe onSelectHub={setSelectedHubId} selectedHubId={selectedHubId} />
          </div>
        </section>

        <section className='login-page__terminal' aria-label='注册 DeepOrganiser'>
          <div className='login-page__terminal-inner login-page__terminal-inner--register'>
            <div className='login-page__terminal-header'>
              <div>
                <span className='login-page__terminal-kicker'>CREATE ACCOUNT</span>
                <h2 className='login-page__card-title'>注册工作台</h2>
              </div>
              <div className='register-page__stepper' aria-label='注册进度'>
                <span className={step === 'account' ? 'is-active' : 'is-done'}>1</span>
                <span className={step === 'collaboration' ? 'is-active' : step === 'ready' ? 'is-done' : ''}>2</span>
                <span className={step === 'ready' ? 'is-active' : ''}>3</span>
              </div>
            </div>

            <div className='login-page__terminal-strip' aria-hidden='true'>
              <span />
              <span />
              <span />
            </div>

            {step === 'account' && (
              <form className='login-page__form' onSubmit={handleCreateAccount}>
                <div className='login-page__form-item'>
                  <label className='login-page__label' htmlFor='register-username'>
                    用户名
                  </label>
                  <div className='login-page__input-frame'>
                    <span className='login-page__input-halo' aria-hidden='true' />
                    <div className='login-page__input-wrapper'>
                      <svg
                        className='login-page__input-icon'
                        viewBox='0 0 24 24'
                        fill='none'
                        stroke='currentColor'
                        strokeWidth='1.7'
                        aria-hidden='true'
                      >
                        <path d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' />
                        <circle cx='12' cy='7' r='4' />
                      </svg>
                      <input
                        ref={usernameRef}
                        id='register-username'
                        name='username'
                        className='login-page__input'
                        placeholder='输入一个好记的用户名'
                        autoComplete='username'
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        aria-required='true'
                      />
                    </div>
                  </div>
                </div>

                <div className='login-page__form-item'>
                  <label className='login-page__label' htmlFor='register-password'>
                    密码
                  </label>
                  <div className='login-page__input-frame'>
                    <span className='login-page__input-halo' aria-hidden='true' />
                    <div className='login-page__input-wrapper'>
                      <svg
                        className='login-page__input-icon'
                        viewBox='0 0 24 24'
                        fill='none'
                        stroke='currentColor'
                        strokeWidth='1.7'
                        aria-hidden='true'
                      >
                        <rect x='3' y='11' width='18' height='11' rx='2' ry='2' />
                        <path d='M7 11V7a5 5 0 0 1 10 0v4' />
                      </svg>
                      <input
                        ref={passwordRef}
                        id='register-password'
                        name='password'
                        type={passwordVisible ? 'text' : 'password'}
                        className='login-page__input login-page__input--password'
                        placeholder='设置登录密码'
                        autoComplete='new-password'
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        aria-required='true'
                      />
                      <button
                        type='button'
                        className='login-page__toggle-password'
                        onClick={() => setPasswordVisible((prev) => !prev)}
                        aria-label={passwordVisible ? '隐藏密码' : '显示密码'}
                      >
                        <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8'>
                          {passwordVisible ? (
                            <>
                              <path d='M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24' />
                              <line x1='1' y1='1' x2='23' y2='23' />
                            </>
                          ) : (
                            <>
                              <path d='M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z' />
                              <circle cx='12' cy='12' r='3' />
                            </>
                          )}
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                <button type='submit' className='login-page__submit' disabled={loading}>
                  {loading && (
                    <svg className='login-page__spinner' viewBox='0 0 24 24' width='18' height='18'>
                      <circle
                        cx='12'
                        cy='12'
                        r='10'
                        stroke='currentColor'
                        strokeWidth='3'
                        fill='none'
                        strokeDasharray='50'
                        strokeDashoffset='25'
                        strokeLinecap='round'
                      />
                    </svg>
                  )}
                  <span>{loading ? '正在创建' : '创建并继续'}</span>
                  {!loading && (
                    <svg className='login-page__submit-arrow' viewBox='0 0 24 24' fill='none' stroke='currentColor'>
                      <path d='M5 12h14' />
                      <path d='m13 6 6 6-6 6' />
                    </svg>
                  )}
                </button>
              </form>
            )}

            {step !== 'account' && (
              <div className='register-page__panel'>
                <div className='register-page__account-card'>
                  <span className='register-page__account-mark'>✓</span>
                  <div>
                    <strong>{username.trim() || '账号已创建'}</strong>
                    <p>本地登录入口已经准备好。</p>
                  </div>
                </div>

                {step === 'collaboration' ? (
                  <>
                    <div className='register-page__collaboration-card'>
                      <div>
                        <span className='login-page__terminal-kicker'>COLLABORATION</span>
                        <h3>连接飞书协作</h3>
                        <p>使用同一套飞书绑定框完成网页登录、应用绑定和自动化授权。</p>
                      </div>
                    </div>
                    <button type='button' className='login-page__submit' onClick={handleOpenWizard}>
                      <span>连接飞书协作</span>
                      <svg className='login-page__submit-arrow' viewBox='0 0 24 24' fill='none' stroke='currentColor'>
                        <path d='M5 12h14' />
                        <path d='m13 6 6 6-6 6' />
                      </svg>
                    </button>
                    <button type='button' className='register-page__ghost-button' onClick={handleSkipCollaboration}>
                      稍后连接
                    </button>
                  </>
                ) : (
                  <>
                    <div className='register-page__ready-card'>
                      <span>✓</span>
                      <div>
                        <strong>注册流程已完成</strong>
                        <p>现在可以进入工作台继续创建项目、任务和 Agent 会话。</p>
                      </div>
                    </div>
                    <button type='button' className='login-page__submit' onClick={handleEnterApp}>
                      <span>完成并进入工作台</span>
                      <svg className='login-page__submit-arrow' viewBox='0 0 24 24' fill='none' stroke='currentColor'>
                        <path d='M5 12h14' />
                        <path d='m13 6 6 6-6 6' />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            )}

            <div
              role='alert'
              aria-live='polite'
              className={`login-page__message ${message ? 'login-page__message--visible' : ''} ${message ? (message.type === 'success' ? 'login-page__message--success' : 'login-page__message--error') : ''}`}
              hidden={!message}
            >
              {message?.text}
            </div>

            <div className='login-page__switch'>
              <span>已经有账号？</span>
              <button type='button' onClick={() => void navigate('/login')}>
                返回登录
              </button>
            </div>

            <p className='login-page__terminal-footnote'>账号信息会保存到本机，飞书协作可随时在设置中重新绑定</p>
          </div>
        </section>
      </main>

      <FeishuConnectionWizardModal
        visible={wizardVisible}
        loginUrl={loginUrl}
        onClose={handleWizardClose}
        onCancel={handleWizardCancel}
        onStatusChanged={() => undefined}
      />
    </div>
  );
};

export default RegisterPage;
