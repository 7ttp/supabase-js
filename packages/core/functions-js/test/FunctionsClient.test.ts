import { FunctionsClient } from '../src/index'

describe('FunctionsClient', () => {
  describe('invoke – ReadableStream body passthrough', () => {
    const okFetch = () =>
      jest.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ ok: true }),
      })

    const makeStream = () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('streamed'))
          controller.close()
        },
      })

    it('forwards the stream untouched and sets duplex when no Content-Type is supplied', async () => {
      const mockFetch = okFetch()
      const client = new FunctionsClient('http://localhost', { customFetch: mockFetch })
      const stream = makeStream()

      await client.invoke('test-fn', { body: stream })

      const [, init] = mockFetch.mock.calls[0]
      expect(init.body).toBe(stream)
      expect(init.duplex).toBe('half')
      expect(init.headers['Content-Type']).toBeUndefined()
    })

    it('forwards the stream untouched and sets duplex when the caller supplies a Content-Type', async () => {
      const mockFetch = okFetch()
      const client = new FunctionsClient('http://localhost', { customFetch: mockFetch })
      const stream = makeStream()

      await client.invoke('test-fn', {
        body: stream,
        headers: { 'Content-Type': 'application/octet-stream' },
      })

      const [, init] = mockFetch.mock.calls[0]
      expect(init.body).toBe(stream)
      expect(init.duplex).toBe('half')
      expect(init.headers['Content-Type']).toBe('application/octet-stream')
    })

    it('still JSON-serializes a plain object body and does not set duplex', async () => {
      const mockFetch = okFetch()
      const client = new FunctionsClient('http://localhost', { customFetch: mockFetch })

      await client.invoke('test-fn', { body: { name: 'Ada' } })

      const [, init] = mockFetch.mock.calls[0]
      expect(init.body).toBe(JSON.stringify({ name: 'Ada' }))
      expect(init.duplex).toBeUndefined()
      expect(init.headers['Content-Type']).toBe('application/json')
    })
  })

  describe('invoke – abort listener cleanup when timeout + signal are both set', () => {
    it('removes the listener from the caller signal after a successful invoke', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ ok: true }),
      })

      const client = new FunctionsClient('http://localhost', { customFetch: mockFetch })
      const controller = new AbortController()

      const addSpy = jest.spyOn(controller.signal, 'addEventListener')
      const removeSpy = jest.spyOn(controller.signal, 'removeEventListener')

      await client.invoke('test-fn', { timeout: 5000, signal: controller.signal })

      const addedFn = addSpy.mock.calls.find(([event]) => event === 'abort')?.[1]
      const removedFn = removeSpy.mock.calls.find(([event]) => event === 'abort')?.[1]

      expect(addedFn).toBeDefined()
      expect(addedFn).toBe(removedFn)
    })

    it('removes the listener from the caller signal after a failed invoke', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: { get: () => null },
        text: () => Promise.resolve('Internal Server Error'),
      })

      const client = new FunctionsClient('http://localhost', { customFetch: mockFetch })
      const controller = new AbortController()

      const addSpy = jest.spyOn(controller.signal, 'addEventListener')
      const removeSpy = jest.spyOn(controller.signal, 'removeEventListener')

      await client.invoke('test-fn', { timeout: 5000, signal: controller.signal })

      const addedFn = addSpy.mock.calls.find(([event]) => event === 'abort')?.[1]
      const removedFn = removeSpy.mock.calls.find(([event]) => event === 'abort')?.[1]

      expect(addedFn).toBeDefined()
      expect(addedFn).toBe(removedFn)
    })
  })
})
