// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MyLaundryCard from '../overview/MyLaundryCard';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('MyLaundryCard', () => {
  it('does not show false network error when post-mutation refresh is superseded by a background poll', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 201 }));
    const onRefresh = vi.fn().mockRejectedValueOnce(new Error('Refresh scope was replaced'));

    render(
      <MyLaundryCard
        buildingId="b-1"
        accountId="u-1"
        participation="NONE"
        isSyncStale={false}
        entries={[]}
        myHold={null}
        holdHandover={null}
        myCycles={[]}
        machineLabels={{}}
        onRefresh={onRefresh}
        onSessionExpired={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Vào hàng — Sẵn sàng' }));
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows network error when the queue mutation fetch itself fails', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    render(
      <MyLaundryCard
        buildingId="b-1"
        accountId="u-1"
        participation="NONE"
        isSyncStale={false}
        entries={[]}
        myHold={null}
        holdHandover={null}
        myCycles={[]}
        machineLabels={{}}
        onRefresh={vi.fn()}
        onSessionExpired={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Vào hàng — Sẵn sàng' }));
    });

    expect(screen.getByRole('alert').textContent).toContain('Mất kết nối');
  });
});
