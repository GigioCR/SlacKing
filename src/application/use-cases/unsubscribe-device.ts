import { InvalidInputError } from '../../domain/errors'
import type { SubscriptionRepository } from '../ports/subscription-repository'

export function unsubscribeDevice(deps: { subscriptions: SubscriptionRepository }) {
  return async (endpoint: unknown): Promise<{ removed: boolean }> => {
    if (typeof endpoint !== 'string' || !endpoint) throw new InvalidInputError('endpoint is required')
    return { removed: await deps.subscriptions.removeByEndpoint(endpoint) }
  }
}
