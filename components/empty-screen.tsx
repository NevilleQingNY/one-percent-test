export function EmptyScreen() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="flex flex-col items-center gap-6">
        <h1 className="text-center text-5xl font-extrabold bg-gradient-to-r from-purple-600 via-pink-500 to-indigo-400 bg-clip-text text-transparent animate-gradient-x">
          1% 商机搜索
        </h1>
        <p className="text-center text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          帮助每一位超级个体
          <span className="font-semibold text-purple-600 hover:text-purple-700 transition-colors duration-300">发现</span>、
          <span className="font-semibold text-pink-500 hover:text-pink-600 transition-colors duration-300">模仿</span>、
          <span className="font-semibold text-indigo-500 hover:text-indigo-600 transition-colors duration-300">超越</span>
        </p>
        <div className="w-full h-px bg-gradient-to-r from-transparent via-purple-300 to-transparent my-4 dark:via-purple-700"></div>
        <p className="text-center text-sm text-muted-foreground italic">
          探索无限可能，成就非凡未来
        </p>
      </div>
    </div>
  )
}
