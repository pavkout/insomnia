import type { Node } from '@react-types/shared';
import React, { Key } from 'react';
import { useMenuSection, useSeparator } from 'react-aria';
import { TreeState } from 'react-stately';
import styled from 'styled-components';

import { MenuItem } from './menu-item';

interface StyledDividerProps {
  withoutLabel?: boolean;
}

const StyledContainer = styled.div<StyledDividerProps>({
  display: 'flex',
  alignItems: 'center',
  margin: '3px 10px',
});

const StyledDividerSpan = styled.span<StyledDividerProps>({
  whiteSpace: 'nowrap',
  paddingRight: '1em',
  color: 'var(--hl)',
  fontSize: 'var(--font-size-xs)',
  textTransform: 'uppercase',
});

const StyledList = styled.ul({
  padding: 0,
  listStyle: 'none',
});

interface Props<T> {
  dividerLabel?: string;
  section: Node<T>;
  state: TreeState<T>;
  onAction?: (key: Key) => void;
  onClose?: () => void;
}

export const MenuSection = <T extends object>({
  section,
  state,
  onAction,
  onClose,
}: Props<T>) => {
  const { itemProps, headingProps, groupProps } = useMenuSection({
    heading: section.rendered,
    'aria-label': section['aria-label'],
  });

  const { separatorProps } = useSeparator({ elementType: 'li' });

  return (
    <>
      <li {...itemProps}>
        <StyledContainer>
          {section.rendered && <StyledDividerSpan {...headingProps}>{section.rendered}</StyledDividerSpan>}
          <hr {...separatorProps}/>
        </StyledContainer>
        <StyledList {...groupProps}>
          {[...section.childNodes].map((node: any) => (
            <MenuItem
              key={node.key}
              item={node}
              state={state}
              onAction={onAction}
              onClose={onClose}
            />
          ))}
        </StyledList>
      </li>
    </>
  );
};