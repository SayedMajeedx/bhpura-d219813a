import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface KpiCardProps {
  title: string
  value: string | number
  description?: string
  icon?: React.ReactNode
  className?: string
  trend?: {
    value: number
    label: string
    isPositive: boolean
  }
}

export function KpiCard({
  title,
  value,
  description,
  icon,
  className,
  trend,
}: KpiCardProps) {
  return (
    <Card className={cn("", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon && <div className="h-4 w-4 text-muted-foreground">{icon}</div>}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
        {trend && (
          <p className={cn(
            "text-xs mt-1",
            trend.isPositive ? "text-emerald-500" : "text-rose-500"
          )}>
            {trend.isPositive ? "+" : "-"}{Math.abs(trend.value)}% {trend.label}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
