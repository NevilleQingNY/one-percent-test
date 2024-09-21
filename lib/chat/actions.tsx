import 'server-only'

import {
  createAI,
  getMutableAIState,
  getAIState,
  streamUI,
  createStreamableValue
} from 'ai/rsc'
import { createOpenAI } from '@ai-sdk/openai'
import { streamText } from 'ai';

import {
  BotCard,
  BotMessage,
  Stock,
  Purchase
} from '@/components/stocks'

import { z } from 'zod'
import { EventsSkeleton } from '@/components/stocks/events-skeleton'
import { Events } from '@/components/stocks/events'
import { StocksSkeleton } from '@/components/stocks/stocks-skeleton'
import { Stocks } from '@/components/stocks/stocks'
import { StockSkeleton } from '@/components/stocks/stock-skeleton'
import {
  sleep,
  nanoid
} from '@/lib/utils'
import { saveChat } from '@/app/actions'
import { SpinnerMessage, UserMessage } from '@/components/stocks/message'
import { Chat, Message } from '@/lib/types'
import { auth } from '@/auth'
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"

async function submitUserMessage(content: string) {
  'use server'

  const aiState = getMutableAIState<typeof AI>()

  aiState.update({
    ...aiState.get(),
    messages: [
      ...aiState.get().messages,
      {
        id: nanoid(),
        role: 'user',
        content
      }
    ]
  })

  let textStream: undefined | ReturnType<typeof createStreamableValue<string>>
  let textNode: undefined | React.ReactNode

  const openaiApiBase = process.env.OPENAI_API_BASE
  const openaiApiKey = process.env.OPENAI_API_KEY
  let openaiApiModel = process.env.OPENAI_API_MODEL

  const openai = createOpenAI({
    baseURL: openaiApiBase,
    apiKey: openaiApiKey,
  })

  if (!openaiApiModel) {
    throw new Error('OPENAI_API_MODEL is not defined');
  }

  const result = await streamUI({
    model: openai.chat(openaiApiModel),
    initial: <SpinnerMessage />,
    system: `你是一位顶尖的商业战略顾问，专长于案例分析和战略制定。基于提供的搜索结果，请完成以下任务：

1. 案例综述（约 200 字）：
   - 概括所有案例的核心主题和背景。
   - 指出这些案例在商业领域的重要性和相关性。

2. 关键洞察（3-5 点，每点 50-100 字）：
   - 深入分析各案例，提炼出最有价值的商业洞察。
   - 找出案例间的共性和差异，突出其战略意义。
   - 每个洞察都应该有清晰的论据支持，并引用相关案例。

3. 战略建议（3-5 条，每条 100-150 字）：
   - 基于以上分析，提出具体、可操作的战略建议。
   - 详细阐述每个建议的实施步骤、预期效果和潜在风险。
   - 解释这些建议如何应对当前的商业挑战或把握市场机遇。

4. 行业趋势预测（约 150 字）：
   - 根据案例分析，对相关行业未来发展做出预测。
   - 指出可能的颠覆性变革和新兴机会。

5. 案例启示总结（约 100 字）：
   - 提炼出这些案例对企业决策者的核心启示。
   - 强调如何将这些启示应用到实际商业运营中。

注意事项：
- 保持分析的客观性和专业性，使用准确的商业术语。
- 确保每个观点都有数据或案例支持，增强可信度。
- 使用简洁的数字引用格式，如 [1]、[2,3] 等，以标注案例来源。
- 结构要清晰，便于阅读和理解，可使用小标题或编号。
- 注重分析的实用性和可操作性，为决策者提供真正有价值的见解。`,
    messages: [
      ...aiState.get().messages.map((message: any) => ({
        role: message.role,
        content: message.content,
        name: message.name
      }))
    ],
    text: ({ content, done, delta }) => {
      if (!textStream) {
        textStream = createStreamableValue('')
        textNode = <BotMessage content={textStream.value} />
      }


      if (done) {
        // todo: 这里需要提升一下done的逻辑，放在这里会报错
        // textStream.done()
        aiState.done({
          ...aiState.get(),
          messages: [
            ...aiState.get().messages,
            {
              id: nanoid(),
              role: 'assistant',
              content
            }
          ]
        })
      } else {
        textStream.update(delta)
      }

      return textNode
    },
    tools: {
      search: {
        description: '搜索与用户查询相关的商业案例。',
        parameters: z.object({
          query: z.string().describe('商业案例的搜索查询'),
        }),
        generate: async function* ({ query }) {
          yield (
            <BotCard>
              <div className="space-y-4">
                <div className="text-lg font-medium text-purple-600">正在探索商机的海洋...</div>
                <div className="text-sm text-muted-foreground italic">每一次搜索都是一次冒险，让我们共同发现未知的宝藏</div>
              </div>
            </BotCard>
          )

          let searchResult = null;
          try {
            const response = await fetch(`${process.env.AI_SEARCH_API_URL}/one_percent_search`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ query })
            });

            if (!response.ok) {
              throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const data = await response.json();
            searchResult = {
              results: data.results,
              query: query,
              images: data.images || [],
              number_of_results: data.number_of_results || 0
            };

          } catch (error) {
            console.error('Search API error:', error)
            searchResult = {
              results: [],
              query: query,
              images: [],
              number_of_results: 0
            }
          }

          const references = searchResult.results.map((result: any, index: number) => ({
            index: index + 1,
            title: result.title,
            url: result.url,
            summary: result.summary || '',
            favicon: `https://www.google.com/s2/favicons?domain=${new URL(result.url).hostname}`,
          }));

          yield (
            <BotCard>
              <div className="space-y-4">
                <div className="text-lg font-medium text-pink-500">正在提炼商业智慧...</div>
                <div className="text-sm text-muted-foreground italic">从繁复中寻找简约，为您呈现最精华的商业洞见</div>
              </div>
            </BotCard>
          )

          const summaryStream = createStreamableValue('')

            ; (async () => {
              const { textStream } = await streamText({
                model: openai(openaiApiModel),
                system: `你是一位顶尖的商业战略顾问，专长于案例分析和战略制定。基于提供的搜索结果，请完成以下任务：

1. 案例综述（约 200 字）：
   - 概括所有案例的核心主题和背景。
   - 指出这些案例在商业领域的重要性和相关性。

2. 关键洞察（3-5 点，每点 50-100 字）：
   - 深入分析各案例，提炼出最有价值的商业洞察。
   - 找出案例间的共性和差异，突出其战略意义。
   - 每个洞察都应该有清晰的论据支持，并引用相关案例。

3. 战略建议（3-5 条，每条 100-150 字）：
   - 基于以上分析，提出具体、可操作的战略建议。
   - 详细阐述每个建议的实施步骤、预期效果和潜在风险。
   - 解释这些建议如何应对当前的商业挑战或把握市场机遇。

4. 行业趋势预测（约 150 字）：
   - 根据案例分析，对相关行业未来发展做出预测。
   - 指出可能的颠覆性变革和新兴机会。

5. 案例启示总结（约 100 字）：
   - 提炼出这些案例对企业决策者的核心启示。
   - 强调如何将这些启示应用到实际商业运营中。

注意事项：
- 保持分析的客观性和专业性，使用准确的商业术语。
- 确保每个观点都有数据或案例支持，增强可信度。
- 使用简洁的数字引用格式，如 [1]、[2,3] 等，以标注案例来源。
- 结构要清晰，便于阅读和理解，可使用小标题或编号。
- 注重分析的实用性和可操作性，为决策者提供真正有价值的见解。`,
                messages: [{ role: 'user', content: JSON.stringify(searchResult) }],
              });

              for await (const text of textStream) {
                summaryStream.update(text);
              }

              summaryStream.done();
            })();

          // Show incremental updates as the summary is being generated
          let progress = 66;
          while (!summaryStream.done) {
            progress = Math.min(progress + 5, 95); // Increment progress, max 95%
            yield (
              <BotCard>
                <BotMessage content={summaryStream.value} />
                <div className="mt-2 space-y-2">
                  <div>正在生成更多内容...</div>
                  <Progress value={progress} className="w-full" />
                </div>
              </BotCard>
            )
            await new Promise(resolve => setTimeout(resolve, 1000)) // Wait for 1 second before next update
          }

          // Final return with complete summary and references
          return (
            <BotCard>
              <BotMessage content={summaryStream.value} />
              <div className="h-px bg-gradient-to-r from-transparent via-purple-300 to-transparent my-4"></div>
              <div className="mb-4">
                <h3 className="font-bold mb-2">参考文献</h3>
                <ScrollArea className="h-[200px]">
                  <div className="space-y-2">
                    {references.map((reference: any, index: number) => (
                      <div key={index} className="flex items-center">
                        <span className="mr-2 text-sm text-gray-500">{index + 1}.</span>
                        <img src={reference.favicon} alt="favicon" className="w-4 h-4 mr-2" />
                        <a
                          href={reference.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-gray-500 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 truncate"
                        >
                          {reference.title}
                        </a>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </BotCard>
          )
        }
      }
    }
  })

  return {
    id: nanoid(),
    display: result.value
  }
}

async function submitUserMessage1(content: string) {
  'use server'

  const aiState = getMutableAIState<typeof AI>()

  aiState.update({
    ...aiState.get(),
    messages: [
      ...aiState.get().messages,
      {
        id: nanoid(),
        role: 'user',
        content
      }
    ]
  })

  let textStream: undefined | ReturnType<typeof createStreamableValue<string>>
  let textNode: undefined | React.ReactNode

  const openaiApiBase = process.env.OPENAI_API_BASE
  const openaiApiKey = process.env.OPENAI_API_KEY
  let openaiApiModel = process.env.OPENAI_API_MODEL

  const openai = createOpenAI({
    baseURL: openaiApiBase, // optional base URL for proxies etc.
    apiKey: openaiApiKey, // optional API key, default to env property OPENAI_API_KEY
  })

  if (!openaiApiModel) {
    throw new Error('OPENAI_API_MODEL is not defined');
  }

  const result = await streamUI({
    model: openai.chat(openaiApiModel),
    initial: <SpinnerMessage />,
    system: `\
    You are a stock trading conversation bot and you can help users buy stocks, step by step.
    You and the user can discuss stock prices and the user can adjust the amount of stocks they want to buy, or place an order, in the UI.
    
    Messages inside [] means that it's a UI element or a user event. For example:
    - "[Price of AAPL = 100]" means that an interface of the stock price of AAPL is shown to the user.
    - "[User has changed the amount of AAPL to 10]" means that the user has changed the amount of AAPL to 10 in the UI.
    
    If the user requests purchasing a stock, call \`show_stock_purchase_ui\` to show the purchase UI.
    If the user just wants the price, call \`show_stock_price\` to show the price.
    If you want to show trending stocks, call \`list_stocks\`.
    If you want to show events, call \`get_events\`.
    If the user wants to sell stock, or complete another impossible task, respond that you are a demo and cannot do that.
    
    Besides that, you can also chat with users and do some calculations if needed.`,
    messages: [
      ...aiState.get().messages.map((message: any) => ({
        role: message.role,
        content: message.content,
        name: message.name
      }))
    ],
    text: ({ content, done, delta }) => {
      if (!textStream) {
        textStream = createStreamableValue('')
        textNode = <BotMessage content={textStream.value} />
      }

      if (done) {
        textStream.done()
        aiState.done({
          ...aiState.get(),
          messages: [
            ...aiState.get().messages,
            {
              id: nanoid(),
              role: 'assistant',
              content
            }
          ]
        })
      } else {
        textStream.update(delta)
      }

      return textNode
    },
    tools: {
      listStocks: {
        description: 'List three imaginary stocks that are trending.',
        parameters: z.object({
          stocks: z.array(
            z.object({
              symbol: z.string().describe('The symbol of the stock'),
              price: z.number().describe('The price of the stock'),
              delta: z.number().describe('The change in price of the stock')
            })
          )
        }),
        generate: async function* ({ stocks }) {
          yield (
            <BotCard>
              <StocksSkeleton />
            </BotCard>
          )

          await sleep(1000)

          const toolCallId = nanoid()

          aiState.done({
            ...aiState.get(),
            messages: [
              ...aiState.get().messages,
              {
                id: nanoid(),
                role: 'assistant',
                content: [
                  {
                    type: 'tool-call',
                    toolName: 'listStocks',
                    toolCallId,
                    args: { stocks }
                  }
                ]
              },
              {
                id: nanoid(),
                role: 'tool',
                content: [
                  {
                    type: 'tool-result',
                    toolName: 'listStocks',
                    toolCallId,
                    result: stocks
                  }
                ]
              }
            ]
          })

          return (
            <BotCard>
              <Stocks props={stocks} />
            </BotCard>
          )
        }
      },
      showStockPrice: {
        description:
          'Get the current stock price of a given stock or currency. Use this to show the price to the user.',
        parameters: z.object({
          symbol: z
            .string()
            .describe(
              'The name or symbol of the stock or currency. e.g. DOGE/AAPL/USD.'
            ),
          price: z.number().describe('The price of the stock.'),
          delta: z.number().describe('The change in price of the stock')
        }),
        generate: async function* ({ symbol, price, delta }) {
          yield (
            <BotCard>
              <StockSkeleton />
            </BotCard>
          )

          await sleep(1000)

          const toolCallId = nanoid()

          aiState.done({
            ...aiState.get(),
            messages: [
              ...aiState.get().messages,
              {
                id: nanoid(),
                role: 'assistant',
                content: [
                  {
                    type: 'tool-call',
                    toolName: 'showStockPrice',
                    toolCallId,
                    args: { symbol, price, delta }
                  }
                ]
              },
              {
                id: nanoid(),
                role: 'tool',
                content: [
                  {
                    type: 'tool-result',
                    toolName: 'showStockPrice',
                    toolCallId,
                    result: { symbol, price, delta }
                  }
                ]
              }
            ]
          })

          return (
            <BotCard>
              <Stock props={{ symbol, price, delta }} />
            </BotCard>
          )
        }
      },
      showStockPurchase: {
        description:
          'Show price and the UI to purchase a stock or currency. Use this if the user wants to purchase a stock or currency.',
        parameters: z.object({
          symbol: z
            .string()
            .describe(
              'The name or symbol of the stock or currency. e.g. DOGE/AAPL/USD.'
            ),
          price: z.number().describe('The price of the stock.'),
          numberOfShares: z
            .number()
            .optional()
            .describe(
              'The **number of shares** for a stock or currency to purchase. Can be optional if the user did not specify it.'
            )
        }),
        generate: async function* ({ symbol, price, numberOfShares = 100 }) {
          const toolCallId = nanoid()

          if (numberOfShares <= 0 || numberOfShares > 1000) {
            aiState.done({
              ...aiState.get(),
              messages: [
                ...aiState.get().messages,
                {
                  id: nanoid(),
                  role: 'assistant',
                  content: [
                    {
                      type: 'tool-call',
                      toolName: 'showStockPurchase',
                      toolCallId,
                      args: { symbol, price, numberOfShares }
                    }
                  ]
                },
                {
                  id: nanoid(),
                  role: 'tool',
                  content: [
                    {
                      type: 'tool-result',
                      toolName: 'showStockPurchase',
                      toolCallId,
                      result: {
                        symbol,
                        price,
                        numberOfShares,
                        status: 'expired'
                      }
                    }
                  ]
                },
                {
                  id: nanoid(),
                  role: 'system',
                  content: `[User has selected an invalid amount]`
                }
              ]
            })

            return <BotMessage content={'Invalid amount'} />
          } else {
            aiState.done({
              ...aiState.get(),
              messages: [
                ...aiState.get().messages,
                {
                  id: nanoid(),
                  role: 'assistant',
                  content: [
                    {
                      type: 'tool-call',
                      toolName: 'showStockPurchase',
                      toolCallId,
                      args: { symbol, price, numberOfShares }
                    }
                  ]
                },
                {
                  id: nanoid(),
                  role: 'tool',
                  content: [
                    {
                      type: 'tool-result',
                      toolName: 'showStockPurchase',
                      toolCallId,
                      result: {
                        symbol,
                        price,
                        numberOfShares
                      }
                    }
                  ]
                }
              ]
            })

            return (
              <BotCard>
                <Purchase
                  props={{
                    numberOfShares,
                    symbol,
                    price: +price,
                    status: 'requires_action'
                  }}
                />
              </BotCard>
            )
          }
        }
      },
      getEvents: {
        description:
          'List funny imaginary events between user highlighted dates that describe stock activity.',
        parameters: z.object({
          events: z.array(
            z.object({
              date: z
                .string()
                .describe('The date of the event, in ISO-8601 format'),
              headline: z.string().describe('The headline of the event'),
              description: z.string().describe('The description of the event')
            })
          )
        }),
        generate: async function* ({ events }) {
          yield (
            <BotCard>
              <EventsSkeleton />
            </BotCard>
          )

          await sleep(1000)

          const toolCallId = nanoid()

          aiState.done({
            ...aiState.get(),
            messages: [
              ...aiState.get().messages,
              {
                id: nanoid(),
                role: 'assistant',
                content: [
                  {
                    type: 'tool-call',
                    toolName: 'getEvents',
                    toolCallId,
                    args: { events }
                  }
                ]
              },
              {
                id: nanoid(),
                role: 'tool',
                content: [
                  {
                    type: 'tool-result',
                    toolName: 'getEvents',
                    toolCallId,
                    result: events
                  }
                ]
              }
            ]
          })

          return (
            <BotCard>
              <Events props={events} />
            </BotCard>
          )
        }
      }
    }
  })

  return {
    id: nanoid(),
    display: result.value
  }
}

export type AIState = {
  chatId: string
  messages: Message[]
}

export type UIState = {
  id: string
  display: React.ReactNode
}[]

export const AI = createAI<AIState, UIState>({
  actions: {
    submitUserMessage,
    submitUserMessage1,
  },
  initialUIState: [],
  initialAIState: { chatId: nanoid(), messages: [] },
  onGetUIState: async () => {
    'use server'

    const session = await auth()

    if (session && session.user) {
      const aiState = getAIState() as Chat

      if (aiState) {
        const uiState = getUIStateFromAIState(aiState)
        return uiState
      }
    } else {
      return
    }
  },
  onSetAIState: async ({ state }) => {
    'use server'

    const session = await auth()

    if (session && session.user) {
      const { chatId, messages } = state

      const createdAt = new Date()
      const userId = session.user.id as string
      const path = `/chat/${chatId}`

      const firstMessageContent = messages[0].content as string
      const title = firstMessageContent.substring(0, 100)

      const chat: Chat = {
        id: chatId,
        title,
        userId,
        createdAt,
        messages,
        path
      }

      await saveChat(chat)
    } else {
      return
    }
  }
})

export const getUIStateFromAIState = (aiState: Chat) => {
  return aiState.messages
    .filter(message => message.role !== 'system')
    .map((message, index) => ({
      id: `${aiState.chatId}-${index}`,
      display:
        message.role === 'tool' ? (
          message.content.map(tool => {
            return tool.toolName === 'listStocks' ? (
              <BotCard>
                {/* TODO: Infer types based on the tool result*/}
                {/* @ts-expect-error */}
                <Stocks props={tool.result} />
              </BotCard>
            ) : tool.toolName === 'showStockPrice' ? (
              <BotCard>
                {/* @ts-expect-error */}
                <Stock props={tool.result} />
              </BotCard>
            ) : tool.toolName === 'showStockPurchase' ? (
              <BotCard>
                {/* @ts-expect-error */}
                <Purchase props={tool.result} />
              </BotCard>
            ) : tool.toolName === 'getEvents' ? (
              <BotCard>
                {/* @ts-expect-error */}
                <Events props={tool.result} />
              </BotCard>
            ) : null
          })
        ) : message.role === 'user' ? (
          <UserMessage>{message.content as string}</UserMessage>
        ) : message.role === 'assistant' &&
          typeof message.content === 'string' ? (
          <BotMessage content={message.content} />
        ) : null
    }))
}
