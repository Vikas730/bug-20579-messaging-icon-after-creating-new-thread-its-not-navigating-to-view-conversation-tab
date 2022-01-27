import { CommonService } from './../../../../../services/common.service';
import { ConversationRelationApi } from './../../../../../sdk/services/custom/ConversationRelation';
import { Component, OnInit, OnDestroy, Output, Input, EventEmitter, ViewChildren, QueryList, ElementRef } from '@angular/core';
import { Subscription, Observable } from 'rxjs';
import { AppStateService } from './../../../../../services/app-state.service';
import { AlertService } from './../../../../../services/alert.service';
import { PreloaderService } from './../../../../../services/preloader.service';
import { TaskConversationService } from './../../../../../services/task-conversation.service';
import { DeliveryManagerService } from 'shared/views/pms/delivery-manager/delivery-manager.service';
import { GlobalChatService } from 'shared/services/global-chat.service';
@Component({
  selector: 'app-task-conversation-list',
  templateUrl: './task-conversation-list.component.html',
  styleUrls: ['./task-conversation-list.component.css']
})
export class TaskConversationListComponent implements OnInit, OnDestroy {
  @Input() fromChatBoard = false;
  @Output() favUpdated = new EventEmitter();
  @Output() conversationData = new EventEmitter();
  @ViewChildren('divClick') divClick: QueryList<ElementRef>;
  @Output() selected = new EventEmitter();
  @Input() selectedTab: string;
  @Input() isPinningEnabled = false;
  totalRecordsAvailable: number;
  totalRecordCount: any;
  @Input() set modelId(e) {
    if (e) {
      this._modelId = e;
      this.listData = [];
      this.getTaskConverstaionList();
    }
  }
  @Input()
  set filterData(e) {
    this.listData = [];
    if (e) {
      this.appliedFilter = true;
      this.filterCondition = e;
      this.localFilter = e;
      this.getTaskConverstaionList(this.filterCondition);
    }
  }
  @Input()
  set refresh(e) {
    if (e && this.selectedTab === 'favtask') {
      this.listData = [];
      this.getTaskConverstaionList();
    }
  }
  @Input() enableFilters;
  @Input() consoleType: string;
  @Input() enableGC3Tabs = false;
  @Input() set tasksList(e) {
    this._tasksList = [];
    if(e && e.length) {      
      e.forEach(element => {
        this._tasksList.push(element.sfdcId);
      });
      this.getTaskConverstaionList();
    }
  };
  @Input() set forRecruitmentJobs(e) {
    this._forRecruitmentJobs = e;
    this.getTaskConverstaionList(this.filterCondition);
    this.refreshOnNewConversion();    
    this.setRecordsCount();
  };
  public _forRecruitmentJobs = false;

  localFilter: any = {};
  _tasksList = [];
  _modelId: any;
  listData = [];
  pinnedData = [];
  pinnedDataIds = [];
  filterCondition: any;
  // customListData: any;
  appliedFilter = false;
  errorMessage: any;
  activeId: any;
  defaultToggleView = true;
  listType: String;
  limit = 200;
  filterObj = {};
  createdAt = null;
  accessType;
  userTypeSlug;
  // accountCommunityTypeSelected = '';
  private conversationTimerSub: Subscription;
  constructor(
    private _loader: PreloaderService,
    private _alertService: AlertService,
    private _appState: AppStateService,
    private _taskConversationService: TaskConversationService,
    private _conversationApi: ConversationRelationApi,
    private _commonService: CommonService,
    private _deliveryManagerService: DeliveryManagerService,
    private _globalChatService: GlobalChatService,
  ) { 
    const appData = JSON.parse(localStorage.getItem('appData'));
      if (appData.user) {
        this.accessType = appData.user.accessType;
        this.userTypeSlug = appData.user.userType.slug;
      }
  }

  ngOnInit() {
    if(!this._forRecruitmentJobs) {
      this.filterCondition = this._commonService.getGlobalFilter(this.enableFilters);
      if (localStorage.getItem('pinnedConversation') && this.selectedTab === 'alltask' && !this.consoleType) {
        const prePinnedDataIds = JSON.parse(localStorage.getItem('pinnedConversation'));
        if (prePinnedDataIds && prePinnedDataIds.length) {
          this.pinnedDataIds = prePinnedDataIds;
          this.getPinnedData(this.filterCondition);
        }
      }
      this.getTaskConverstaionList(this.filterCondition);
      this.refreshOnNewConversion();    
      this.setRecordsCount();
    }    
  }

  refreshOnNewConversion() {
    this._taskConversationService.getRefreshRow().subscribe((taskId) => {
      if (taskId) {
        this._loader.showPreloader();
        setTimeout(() => this.getTaskConverstaionList(this.filterCondition), 1000);
      }
    })
  }

  getPinnedData(filterVal?) {
    if (this.pinnedDataIds && this.pinnedDataIds.length) {
      this._loader.showPreloader();
      this._globalChatService.getTaskConversations({
        where: {
          id: { inq: this.pinnedDataIds }
        },
        listType: this.selectedTab
      }).subscribe(_data => {
        if (filterVal && (filterVal.Account_Type__c !== undefined)) {
          const accountCommunityTypeSelected = this.getSelectedCommunity(filterVal);
          this.pinnedData = _data.filter(ele => {
            if (ele['task'] && ele['task']['account'] && ele['task']['account']['RecordTypeId']) {
              return (ele['task']['account']['RecordTypeId']).toString() === accountCommunityTypeSelected;
            }
          });
        } else {
          this.pinnedData = _data;
        }
        this._loader.hidePreloader();
      }, err => {
        console.error(err);
        this._loader.hidePreloader();
      });
      this.setRecordsCount();
    }
  }

  getTaskConverstaionList(val?) {
    this._loader.showPreloader();
    // this.unsubscribeTimer();
    this.createdAt = '';
    delete this.filterObj['updatedAt'];
    // this.conversationTimerSub = Observable.timer(0, 30000).subscribe(() => {
      this.subscribeTaskConversation(0, false, val)
    // });
  }


  subscribeTaskConversation(skip, loadMore, filterVal?) {
    if (this.createdAt && !loadMore) {
      this.filterObj['updatedAt'] = { gte: this.createdAt };
    } else {
      delete this.filterObj['updatedAt'];
      this._loader.showPreloader();
    }

    if (this.pinnedDataIds && this.pinnedDataIds.length && this.selectedTab === 'alltask' && !this.consoleType) {
      this.filterObj['id'] = { nin: this.pinnedDataIds };
    } else if (this.filterObj['id'] && this.filterObj['id']['nin']) {
      delete this.filterObj['id'];
    }

    // the modelid is related to task id
    if (this._modelId && !(this.accessType === 'vendor'  && this.userTypeSlug === 'admin')) {
      this.filterObj['Related_to_Record_Id__c'] = this._modelId;
    }
    if(this._forRecruitmentJobs && !(this.accessType === 'vendor'  && this.userTypeSlug === 'admin')) {
      this.filterObj['Related_to_Record_Id__c'] = {inq: this._tasksList};
    }
    const filters = {
      where: this.filterObj,
      listType: this.selectedTab,
      limit: this.limit,
      skip: skip
    };
    if (this.filterCondition && Object.keys(this.filterCondition).length &&
      !(this.selectedTab === 'mytask' || this.selectedTab === 'favtask' || this._modelId)) {
      this.appliedFilter = true;
      this.filterCondition = {
        ...this.filterCondition,
        ...(this.filterCondition.Task_Status__c
          ? { Task_Status__c: { inq: this._deliveryManagerService.modifiedTaskStatus(this.filterCondition.Task_Status__c) } } : {}
        ),
      };
      filters['taskFilter'] = this.filterCondition;
    }

    if ((this.localFilter && this.localFilter.PgMO_Milestones__c)) {
      filters['taskFilter'] = { ...(filters['taskFilter'] || {}), };
      filters['taskFilter']['PgMO_Milestones__c'] = { 
        inq: Array.from(
          new Set([
            ...((filters['taskFilter']['PgMO_Milestones__c'] && filters['taskFilter']['PgMO_Milestones__c'].inq) || []),
            ...((this.localFilter.PgMO_Milestones__c && this.localFilter.PgMO_Milestones__c.inq) || [])
          ].filter(Boolean)
          )
        )
      };
    }

    if (loadMore) {
      this._globalChatService.getTaskConversations(filters).subscribe(_data => {
        this.processConversationList(_data, filterVal, loadMore)
        this._loader.hidePreloader();
      }, err => {
        console.error(err);
        this._loader.hidePreloader();
      });
    } else {
      this.unsubscribeTimer();
      this.conversationTimerSub = this._globalChatService.getTaskConversationsContinuous(filters).subscribe(_data => {
        this.processConversationList(_data, filterVal, loadMore)
        this._loader.hidePreloader();
      }, err => {
        console.error(err);
        this._loader.hidePreloader();
      });
    }
    this.setRecordsCount();
  }

  processConversationList(data, filterVal, loadMore) {
    let convList;
      if (filterVal && (filterVal.Account_Type__c !== undefined)) {
        const accountCommunityTypeSelected = this.getSelectedCommunity(filterVal);
        convList = data.filter(ele => {
          if (ele['task'] && ele['task']['account'] && ele['task']['account']['RecordTypeId']) {
            return (ele['task']['account']['RecordTypeId']).toString() === accountCommunityTypeSelected;
          }
        });
      } else {
        convList = data;
      }
      this.conversationData.emit(convList.length)
      if ((this.filterObj['updatedAt'] || loadMore) && this.listData.length) {
        this.unshiftDataInList(convList, loadMore);
      } else {
        this.listData = [...convList];
        this.selectFirstRecord();
      }
      if (!loadMore) {
        this.createdAt = new Date();
      }
  }

  getSelectedCommunity(val) {
    if (val && val.Account_Type__c && val.Account_Type__c.inq && val.Account_Type__c.inq.length) {
      if (val.Account_Type__c.inq[0] === 'internal') {
        return '0121a000000QamvAAC';
      } else if (val.Account_Type__c.inq[0] === 'Partner') {
        return '0121a000000QaUdAAK';
      } else if (val.Account_Type__c.inq[0] === 'Vendor') {
        return '0121a000000QaUYAA0';
      }
    }
    return '';
  }


  unshiftDataInList(_data, isLoadMore?) {
    _data.forEach(_newItem => {
      let index;
      if (!this.listData.some((item, i) => { index = i; return item['id'] === _newItem.id }) &&
        !this.pinnedData.some((item, i) => { index = i; return item['id'] === _newItem.id })) {
        if (isLoadMore) {
          this.listData.push(_newItem);
        } else {
          this.listData.unshift(_newItem);
          this.activeId = _newItem.id;
          this.selected.emit(_newItem);
        }
      } else {
        if (this.pinnedData.some((item, i) => { index = i; return item['id'] === _newItem.id })) {
          this.pinnedData[index]['updatedAt'] = _newItem['updatedAt'];
          this.pinnedData[index]['totalMsg'] = _newItem['totalMsg'];
          this.pinnedData[index]['totalThreads'] = _newItem['totalThreads'];
          this.pinnedData[index]['lastReplyConversation'] = _newItem['lastReplyConversation'];
          this.pinnedData[index]['conversation']['documentCount'] = _newItem['conversation']['documentCount'];
        } else {
          this.listData[index]['updatedAt'] = _newItem['updatedAt'];
          this.listData[index]['totalMsg'] = _newItem['totalMsg'];
          this.listData[index]['totalThreads'] = _newItem['totalThreads'];
          this.listData[index]['lastReplyConversation'] = _newItem['lastReplyConversation'];
         // this.listData[index]['documentCount'] = _newItem['documentCount'];
          this.listData[index]['conversation']['documentCount'] = _newItem['conversation']['documentCount'];
        }
      }
    });
    this.setRecordsCount();
  }
  /**
   * select first item of list
   */
  selectFirstRecord() {
    if (this.pinnedData && this.pinnedData.length) {
      this.activeId = this.pinnedData[0]['id'];
      this.selected.emit(this.pinnedData[0]);
    } else if (this.listData && this.listData.length) {
      this.activeId = this.listData[0]['id'];
      this.selected.emit(this.listData[0]);
    } else {
      this.selected.emit(new Object());
      this.errorMessage = 'No message found';
    }
  }

  /**
 * Change list view
 * @param e default 5 line or 7 line
 */
  toggleListView() {
    this.defaultToggleView = !this.defaultToggleView;
    // this._taskConversationService.setToggleView(this.defaultToggleView);
  }


  onCardClick(event: Event, item: any, button: string) {
    event.stopPropagation();
    if (button === 'fav') {
      this.favUpdated.emit(item);
    } else {
      this.activeId = item.id;
      this.selected.emit(item);
    }
  }

  /**
 *
 * @param e object of like and unlike.
 */
  onfavUpdatedChange(e) {
    // Refresh conversion list if conversation un-favorite on favorite TAB
    /*
    if(e.favoriteId != '' && this.selectedTab === 'favtask') {
      setTimeout(() => {
        this.listData = [];
        this.getTaskConverstaionList();  
      }, 2000);
    }
    */
    this.favUpdated.emit(e);
  }

  onloadMoreChange(e) {
    this.subscribeTaskConversation(this.listData.length, true, this.filterCondition);

  }

  /**
 *
 * @param e object of pinned or unpinned.
 */
  onPinAction(e) {
    if (this.pinnedData.includes(e)) {
      this.pinnedData.splice(this.pinnedData.indexOf(e), 1);
      if (this.filterObj && Object.keys(this.filterObj).length) {
        this.pinnedDataIds = this.pinnedData.map(value => value.id);
        localStorage.setItem('pinnedConversation', JSON.stringify(this.pinnedDataIds));
        this.createdAt = '';
        this.listData = [];
        this.subscribeTaskConversation(0, false);
      } else {
        this.listData.push(e);
        this.sortListData();
      }
    } else {
      if (this.pinnedData.length === 2) {
        return this._alertService.error('You can not pin more than two items.');
      }
      this.listData.splice(this.listData.indexOf(e), 1);
      this.pinnedData.push(e);
    }
    this.pinnedDataIds = this.pinnedData.map(value => value.id);
    localStorage.setItem('pinnedConversation', JSON.stringify(this.pinnedDataIds));
    this.setRecordsCount();
  }

  unsubscribeTimer() {
    if (this.conversationTimerSub) {
      this.conversationTimerSub.unsubscribe();
    }
  }

  ngOnDestroy() {
    // this._taskConversationService.setToggleView(true);
    this.unsubscribeTimer();
    const filterObjKey = ['projects'];
    const filterConditionKey = ['PgMO_Projects__c'];
    this._commonService.removedFromLocalStorage(filterObjKey, filterConditionKey);
  }

  sortListData() {
    this.listData.sort((a, b) => {
      const bDateTime = new Date(Date.parse(b.updatedAt));
      const aDateTime = new Date(Date.parse(a.updatedAt));
      return bDateTime.getTime() - aDateTime.getTime();
    })
  }

  setRecordsCount() {
    this.totalRecordCount = (this.listData.length) ? this.listData[0].totalListCount : 0;
    this.totalRecordsAvailable = this.listData.length + this.pinnedData.length;
  }
}
