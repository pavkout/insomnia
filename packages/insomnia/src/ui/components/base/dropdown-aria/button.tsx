import { AriaButtonProps } from '@react-types/button';
import React, { CSSProperties, forwardRef } from 'react';
import { mergeProps, useButton, useFocusRing } from 'react-aria';
import styled from 'styled-components';

interface StyledButtonProps {
  isDisabled?: boolean;
  isPressed?: boolean;
}

const StyledButton = styled.button<StyledButtonProps>(({ isDisabled }) => ({
  backgroundColor: isDisabled ? '#f9f9f9' : 'transparent',
  outline: 'none',
  height: '100%',
}));

interface Props extends AriaButtonProps {
  isPressed: boolean;
  style?: CSSProperties;
}

export const Button = forwardRef<{}, Props>((props: Props, ref: any) => {
  const { buttonProps, isPressed } = useButton(props, ref);
  const { focusProps } = useFocusRing();

  return (
    <StyledButton
      ref={ref}
      style={props.style}
      isPressed={isPressed || props.isPressed}
      {...mergeProps(buttonProps, focusProps)}
    >
      {props.children}
    </StyledButton>
  );
});

Button.displayName = 'Button';