import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent } from '../../../features/presentation/ui/dialog';
import { Card, CardContent, CardHeader } from '../../../features/presentation/ui/card';
import { Button } from '../../../features/presentation/ui/button';
import { X, Info } from 'lucide-react';
import { useTheme, usePresentationActions } from '../../../features/presentation/PresentationContext';

/**
 * TutorialDialog 用户教程弹窗
 * Props:
 * - isOpen: boolean 是否打开
 * - onClose: () => void 关闭回调（内部会在关闭时记录本地“已查看”状态）
 */
const TutorialDialog = ({ isOpen, onClose }: {isOpen:boolean;onClose:()=>void}) => {
  const { instanceId, notify } = usePresentationActions();
		const { themeColor } = useTheme();
	const pages = useMemo(() => [
		{
			key: 'agreement',
			title: '用户协议',
			desc: `欢迎使用本应用！

本应用仅供学习和交流使用，请勿用于商业用途。

音乐API来源于网络，我们未对任何内容进行破解，仅对目标站点的官方API进行了封装，所有数据均直接来源于目标站点官方。我们不对通过本应用获取的任何信息的准确性、完整性或实用性做出任何保证。

用户应对自己的使用行为负责。在任何情况下，本应用的开发者均不对因使用或无法使用本应用而导致的任何直接、间接、附带、特殊、惩戒性或后果性损害承担任何责任。

使用本应用即表示您同意本协议。如果您不同意本协议，请立即停止使用。`
		},
		{
			key: 'memo',
			src: '/assets/video/memo.mp4',
			title: 'Memo 编辑器快速上手',
			desc: '在编辑框中直接输入想法，使用 #标签 分类；支持回车换行、粘贴图片/链接、以及双链引用（在卡片菜单中“建立双链”）。完成后回车发布，或点击卡片右上角图标编辑/分享。'
		},
		{
			key: 'canvas',
			src: '/assets/video/canvas.mp4',
			title: '画布模式使用指南',
			desc: '切换到画布模式后，可在无限画布上自由摆放想法卡片，支持拖拽移动、缩放、以及双击新建卡片。工具栏可切换选择/拖拽等工具，右上角可返回列表模式。'
		}
	], []);

	const [activeIndex, setActiveIndex] = useState(0);
	const [, setIsPlaying] = useState(true);
	const videoRef = useRef<HTMLVideoElement | null>(null);

			useEffect(() => {
		if (!isOpen) return;
		// 自动播放当前视频
		// 自动播放当前视频
		const v = videoRef.current;
		if (v) {
			v.currentTime = 0;
			setIsPlaying(true);
			const playPromise = v.play?.();
			if (playPromise && typeof playPromise.catch === 'function') {
				playPromise.catch(() => {});
			}
		}
	}, [isOpen, activeIndex]);

	const handleEnded = () => {
		// 最后一页不再自动循环，等待用户点击“完成”
		setActiveIndex((prev) => {
			if (prev >= pages.length - 1) return prev;
			return prev + 1;
		});
	};

	const handlePrev = () => setActiveIndex((prev) => (prev > 0 ? prev - 1 : 0));
	const handleNext = () => setActiveIndex((prev) => (prev < pages.length - 1 ? prev + 1 : prev));

	const markViewedAndClose = () => {
		try { localStorage.setItem(`meow:v2:${instanceId}:tutorial`, 'seen'); } catch { notify('教程已关闭，但本机未能保存已查看状态。'); }
		onClose?.();
	};

	const cur = pages[activeIndex] ?? pages[0];
  if (!cur) return null;

	const isAgreementPage = activeIndex === 0;

		return (
			<Dialog open={isOpen} onOpenChange={(open) => !open && markViewedAndClose()}>
						<DialogContent className="p-0 border-0 bg-transparent shadow-none flex items-center justify-center [&>button]:hidden">
							<Card className="w-[98vw] sm:max-w-4xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl max-h-[92vh] flex flex-col bg-white dark:bg-gray-900 shadow-xl font-sans">
						<CardHeader className="flex flex-row items-center justify-end space-y-0 py-3">
							<Button
								variant="ghost"
								size="icon"
								onClick={markViewedAndClose}
								className="h-8 w-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
							>
								<X className="h-4 w-4" />
							</Button>
						</CardHeader>
									<CardContent className="space-y-4 flex-1 overflow-y-auto scrollbar-hidden pt-0">
										{/* 视频置顶，占据主要空间 */}
										{cur.src && (
											<div className="relative rounded-xl overflow-hidden bg-black/90 aspect-video">
												<video
													key={cur.key}
													ref={videoRef}
													src={cur.src}
													className="w-full h-full"
													controls={false}
													muted
													autoPlay
													onEnded={handleEnded}
												/>
											</div>
										)}
										{/* 说明区（默认字体，去除卡片背景） */}
										<div className="flex flex-col gap-3 sm:gap-4">
											<div className="flex items-center gap-2">
												<Info className="h-4 w-4 text-gray-500" />
												<h3 className="text-base font-semibold">{cur.title}</h3>
											</div>
											<p className="text-sm sm:text-[15px] text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
												{cur.desc}
											</p>

											{/* 导航按钮：上一步/下一步 */}
											<div className="flex flex-col sm:flex-row gap-2 sm:justify-end pt-2">
												{!isAgreementPage && <Button variant="outline" className="sm:w-auto" onClick={handlePrev}>上一步</Button>}
												<Button
													className="sm:w-auto"
													onClick={() => {
														if (activeIndex >= pages.length - 1) {
															markViewedAndClose();
														} else {
															handleNext();
														}
													}}
													style={{ backgroundColor: themeColor }}
												>
													{isAgreementPage ? '我同意' : (activeIndex >= pages.length - 1 ? '完成' : '下一步')}
												</Button>
											</div>
										</div>
									</CardContent>
					</Card>
				</DialogContent>
			</Dialog>
		);
};

export default TutorialDialog;
