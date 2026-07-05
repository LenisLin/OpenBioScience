import React from 'react';
import { CheckOne } from '@icon-park/react';

export type OnboardingStepperStep = {
  id: string;
  title: string;
};

type OnboardingStepperProps = {
  steps: OnboardingStepperStep[];
  currentStep: number;
  children: React.ReactNode;
  nextLabel: string;
  backLabel: string;
  skipLabel: string;
  completeLabel: string;
  nextDisabled?: boolean;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
};

const OnboardingStepper: React.FC<OnboardingStepperProps> = ({
  steps,
  currentStep,
  children,
  nextLabel,
  backLabel,
  skipLabel,
  completeLabel,
  nextDisabled,
  onBack,
  onNext,
  onSkip,
}) => {
  const isFirstStep = currentStep <= 1;
  const isLastStep = currentStep >= steps.length;

  return (
    <section className='onboarding-stepper' aria-label='OpenBioScience onboarding'>
      <div className='onboarding-stepper__rail' aria-label='Tutorial progress'>
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const isComplete = stepNumber < currentStep;
          const isActive = stepNumber === currentStep;
          return (
            <React.Fragment key={step.id}>
              <div
                className={[
                  'onboarding-stepper__dot',
                  isComplete && 'is-complete',
                  isActive && 'is-active',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-current={isActive ? 'step' : undefined}
                title={step.title}
              >
                {isComplete ? <CheckOne theme='outline' size='13' /> : <span>{stepNumber}</span>}
              </div>
              {index < steps.length - 1 && (
                <div className={['onboarding-stepper__connector', isComplete && 'is-complete'].filter(Boolean).join(' ')}>
                  <span />
                </div>
              )}
            </React.Fragment>
          );
        })}
        <div className='onboarding-stepper__top-actions'>
          <button
            type='button'
            className='onboarding-stepper__primary onboarding-stepper__top-next'
            disabled={nextDisabled}
            onClick={onNext}
          >
            {isLastStep ? completeLabel : nextLabel}
          </button>
        </div>
      </div>

      <div className='onboarding-stepper__content' key={currentStep}>
        {children}
      </div>

      <footer className='onboarding-stepper__footer'>
        <button type='button' className='onboarding-stepper__ghost' onClick={onSkip}>
          {skipLabel}
        </button>
        <div className='onboarding-stepper__nav'>
          <button
            type='button'
            className='onboarding-stepper__secondary'
            disabled={isFirstStep}
            onClick={onBack}
          >
            {backLabel}
          </button>
          <button
            type='button'
            className='onboarding-stepper__primary'
            disabled={nextDisabled}
            onClick={onNext}
          >
            {isLastStep ? completeLabel : nextLabel}
          </button>
        </div>
      </footer>
    </section>
  );
};

export default OnboardingStepper;
