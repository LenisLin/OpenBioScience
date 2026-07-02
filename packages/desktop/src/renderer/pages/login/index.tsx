import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { changeLanguage } from '@/renderer/services/i18n';
import DeepScientistLogo from '@renderer/components/icons/DeepScientistLogo';
import DeepScientistWordmark from '@renderer/components/icons/DeepScientistWordmark';
import AppLoader from '@renderer/components/layout/AppLoader';
import LoginResearchGlobe from './components/LoginResearchGlobe';
import { useAuth } from '../../hooks/context/AuthContext';
import './LoginPage.css';

type MessageState = {
  type: 'error' | 'success';
  text: string;
};

const REMEMBER_ME_KEY = 'rememberMe';
const REMEMBERED_USERNAME_KEY = 'rememberedUsername';
const REMEMBERED_PASSWORD_KEY = 'rememberedPassword';
const AUTO_FOCUS_QUERY = '(min-width: 721px)';

const obfuscate = (text: string): string => {
  const encoded = btoa(encodeURIComponent(text));
  return encoded.split('').toReversed().join('');
};

const deobfuscate = (text: string): string => {
  try {
    const reversed = text.split('').toReversed().join('');
    return decodeURIComponent(atob(reversed));
  } catch {
    return '';
  }
};

const resetLoginPageScroll = (): void => {
  const root = document.getElementById('root');
  root?.scrollTo({ left: 0, top: 0 });
  window.scrollTo({ left: 0, top: 0 });

  if (document.scrollingElement) {
    document.scrollingElement.scrollTop = 0;
    document.scrollingElement.scrollLeft = 0;
  }
};

const LoginPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { status, login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [message, setMessage] = useState<MessageState | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedHubId, setSelectedHubId] = useState('westlake');

  const usernameRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const messageTimer = useRef<number | undefined>(undefined);

  useLayoutEffect(() => {
    document.documentElement.classList.add('login-page-active-root');
    document.body.classList.add('login-page-active');
    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';

    resetLoginPageScroll();
    const animationFrame = window.requestAnimationFrame(resetLoginPageScroll);
    const scrollResetTimer = window.setTimeout(resetLoginPageScroll, 120);

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
    document.title = t('login.pageTitle');
  }, [t]);

  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  useEffect(() => {
    const isRememberMe = localStorage.getItem(REMEMBER_ME_KEY) === 'true';
    if (isRememberMe) {
      const storedUsername = localStorage.getItem(REMEMBERED_USERNAME_KEY);
      const storedPassword = localStorage.getItem(REMEMBERED_PASSWORD_KEY);
      if (storedUsername) setUsername(deobfuscate(storedUsername));
      if (storedPassword) setPassword(deobfuscate(storedPassword));
      setRememberMe(true);
    }
    window.setTimeout(() => {
      if (window.matchMedia(AUTO_FOCUS_QUERY).matches) {
        usernameRef.current?.focus({ preventScroll: true });
      }
      resetLoginPageScroll();
    }, 0);

    return () => {
      if (messageTimer.current) {
        window.clearTimeout(messageTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      void navigate('/guid', { replace: true });
    }
  }, [navigate, status]);

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

  const supportedLanguages = useMemo<{ code: string; label: string }[]>(
    () => [
      { code: 'zh-CN', label: '简体中文' },
      { code: 'zh-TW', label: '繁體中文' },
      { code: 'ja-JP', label: '日本語' },
      { code: 'es-ES', label: 'Español' },
      { code: 'ko-KR', label: '한국어' },
      { code: 'tr-TR', label: 'Türkçe' },
      { code: 'uk-UA', label: 'Українська' },
      { code: 'pt-BR', label: 'Português (BR)' },
      { code: 'de-DE', label: 'Deutsch' },
      { code: 'en-US', label: 'English' },
    ],
    []
  );

  const handleLanguageChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextLanguage = event.target.value;
    changeLanguage(nextLanguage).catch((error: Error) => {
      console.error('Failed to change language:', error);
    });
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const trimmedUsername = username.trim();

      if (!trimmedUsername || !password) {
        showMessage({ type: 'error', text: t('login.errors.empty') });
        return;
      }

      setLoading(true);
      setMessage(null);

      const result = await login({ username: trimmedUsername, password, remember: rememberMe });

      if (result.success) {
        if (rememberMe) {
          localStorage.setItem(REMEMBER_ME_KEY, 'true');
          localStorage.setItem(REMEMBERED_USERNAME_KEY, obfuscate(trimmedUsername));
          localStorage.setItem(REMEMBERED_PASSWORD_KEY, obfuscate(password));
        } else {
          localStorage.removeItem(REMEMBER_ME_KEY);
          localStorage.removeItem(REMEMBERED_USERNAME_KEY);
          localStorage.removeItem(REMEMBERED_PASSWORD_KEY);
        }

        showMessage({ type: 'success', text: t('login.success') });

        window.setTimeout(() => {
          void navigate('/guid', { replace: true });
        }, 600);
      } else {
        const errorText = (() => {
          switch (result.code) {
            case 'invalidCredentials':
              return t('login.errors.invalidCredentials');
            case 'tooManyAttempts':
              return t('login.errors.tooManyAttempts');
            case 'networkError':
              return t('login.errors.networkError');
            case 'serverError':
              return t('login.errors.serverError');
            case 'unknown':
            default:
              return result.message ?? t('login.errors.unknown');
          }
        })();

        showMessage({ type: 'error', text: errorText });
      }

      setLoading(false);
    },
    [login, navigate, password, rememberMe, showMessage, t, username]
  );

  if (status === 'checking') {
    return <AppLoader />;
  }

  return (
    <div className='login-page'>
      <div className='login-page__grid' aria-hidden='true' />
      <div className='login-page__axis login-page__axis--vertical' aria-hidden='true' />
      <div className='login-page__axis login-page__axis--horizontal' aria-hidden='true' />

      <header className='login-page__topbar'>
        <div className='login-page__identity'>
          <DeepScientistWordmark
            aria-label='OpenScience'
            className='login-page__wordmark-image'
            wrapperClassName='login-page__wordmark'
          />
          <DeepScientistLogo
            aria-hidden='true'
            className='login-page__identity-logo-image'
            wrapperClassName='login-page__identity-logo'
          />
        </div>
        <span className='login-page__topbar-meta'>{t('login.sessionCode')}</span>
      </header>

      <main className='login-page__main' id='landing-main'>
        <section className='login-page__story' aria-labelledby='login-page-heading'>
          <div className='login-page__copy'>
            <span className='login-page__eyebrow'>{t('login.editorialEyebrow')}</span>
            <h1 id='login-page-heading' className='login-page__title'>
              {t('login.editorialTitle')}
            </h1>
            <p className='login-page__subtitle'>{t('login.editorialSubtitle')}</p>
          </div>

          <div className='login-page__globe-shell'>
            <LoginResearchGlobe onSelectHub={setSelectedHubId} selectedHubId={selectedHubId} />
          </div>
        </section>

        <section className='login-page__terminal' aria-label={t('login.brand')}>
          <div className='login-page__terminal-inner'>
            <div className='login-page__terminal-header'>
              <div>
                <span className='login-page__terminal-kicker'>{t('login.cardKicker')}</span>
                <h2 className='login-page__card-title'>{t('login.cardTitle')}</h2>
              </div>
              <label className='login-page__lang-select-wrapper' htmlFor='lang-select'>
                <span className='login-page__lang-label'>{t('login.languageToggle')}</span>
                <select
                  id='lang-select'
                  className='login-page__lang-select'
                  value={i18n.language}
                  onChange={handleLanguageChange}
                >
                  {supportedLanguages.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className='login-page__terminal-strip' aria-hidden='true'>
              <span />
              <span />
              <span />
            </div>

            <form className='login-page__form' onSubmit={handleSubmit}>
              <div className='login-page__form-item'>
                <label className='login-page__label' htmlFor='username'>
                  {t('login.username')}
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
                      id='username'
                      name='username'
                      className='login-page__input'
                      placeholder={t('login.usernamePlaceholder')}
                      autoComplete='username'
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      aria-required='true'
                    />
                  </div>
                </div>
              </div>

              <div className='login-page__form-item'>
                <label className='login-page__label' htmlFor='password'>
                  {t('login.password')}
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
                      id='password'
                      name='password'
                      type={passwordVisible ? 'text' : 'password'}
                      className='login-page__input login-page__input--password'
                      placeholder={t('login.passwordPlaceholder')}
                      autoComplete='current-password'
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      aria-required='true'
                    />
                    <button
                      type='button'
                      className='login-page__toggle-password'
                      onClick={() => setPasswordVisible((prev) => !prev)}
                      aria-label={passwordVisible ? t('login.hidePassword') : t('login.showPassword')}
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

              <div className='login-page__form-row'>
                <label className='login-page__checkbox' htmlFor='remember-me'>
                  <input
                    type='checkbox'
                    id='remember-me'
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.target.checked)}
                  />
                  <span>{t('login.rememberMe')}</span>
                </label>
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
                <span>{loading ? t('login.submitting') : t('login.submit')}</span>
                {!loading && (
                  <svg className='login-page__submit-arrow' viewBox='0 0 24 24' fill='none' stroke='currentColor'>
                    <path d='M5 12h14' />
                    <path d='m13 6 6 6-6 6' />
                  </svg>
                )}
              </button>

              <div
                role='alert'
                aria-live='polite'
                className={`login-page__message ${message ? 'login-page__message--visible' : ''} ${message ? (message.type === 'success' ? 'login-page__message--success' : 'login-page__message--error') : ''}`}
                hidden={!message}
              >
                {message?.text}
              </div>
            </form>

            <div className='login-page__switch'>
              <span>{t('login.noAccount')}</span>
              <button type='button' onClick={() => void navigate('/register')}>
                {t('login.createAccount')}
              </button>
            </div>

            <p className='login-page__terminal-footnote'>{t('login.footerPrimary')}</p>
          </div>
        </section>
      </main>
    </div>
  );
};

export default LoginPage;
